import { randomUUID } from "node:crypto";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { missingBotPermissionNames } from "#lib/permissions.js";
import liveStore from "../services/live-store.service.js";
import watcher from "../services/watcher.service.js";
import { editable, type ChessEditMessage } from "../views.js";
import type { LiveSnapshot } from "./sources.js";
import type { LiveGame } from "./types.js";
import { liveMessage } from "./views.js";

export interface WatchContext {
  guildId: string;
  channelId: string;
  ownerId: string;
  /** Set when the game came from a username list, to orient the board. */
  requestedPlayer?: string | undefined;
  t: TFunction;
  /** Publishes the board and returns its message, which the DB must remember. */
  send: (message: ChessEditMessage) => Promise<{ id: string }>;
}

function liveGameFromSnapshot(
  snapshot: LiveSnapshot,
  context: WatchContext
): LiveGame {
  return {
    id: randomUUID(),
    source: snapshot.source,
    gameId: snapshot.gameId,
    url: snapshot.url,
    guildId: context.guildId,
    channelId: context.channelId,
    messageId: "",
    ownerId: context.ownerId,
    white: snapshot.white,
    black: snapshot.black,
    timeControl: snapshot.timeControl,
    // The account asked for stays at the bottom, whatever its colour.
    flipped: context.requestedPlayer
      ? snapshot.black.toLowerCase() === context.requestedPlayer.toLowerCase()
      : false,
    moves: snapshot.moves,
    startFen: snapshot.startFen,
    ply: snapshot.moves.length,
    finished: snapshot.finished,
    result: snapshot.result,
  };
}

/**
 * Shared by `/chess watch` and the list's "Regarder" button: both publish the
 * same public board and start the same poll, whether the interaction replies
 * to a command or follows up on a button.
 */
export async function startWatchFlow(
  snapshot: LiveSnapshot,
  context: WatchContext
): Promise<void> {
  const game = liveGameFromSnapshot(snapshot, context);
  const posted = await context.send(
    editable(await liveMessage(game, context.t, game.ply, false))
  );
  // A finished game is shown once and never enters the database.
  if (!game.finished) {
    const stored = await liveStore.watch({ ...game, messageId: posted.id });
    watcher.track(stored);
  }
}

/**
 * Each watch polls a chess site every few seconds for as long as the game
 * lasts (days, for a correspondence game): a member and a server may only
 * follow so many at once.
 */
export const MAX_WATCHES_PER_MEMBER = 3;
export const MAX_WATCHES_PER_GUILD = 10;

/**
 * Why a watch cannot start here, or null. The watcher edits the public
 * message long after the interaction token has expired: it needs to see the
 * channel, fetch its own message there and attach the redrawn board, or the
 * board would freeze.
 */
export async function watchRefusal(
  interaction: Pick<
    ChatInputCommandInteraction | ButtonInteraction,
    "guild" | "guildId" | "channel" | "user"
  >,
  t: TFunction
): Promise<string | null> {
  const { guild, guildId, channel, user } = interaction;
  if (!guild || !guildId || !channel || channel.isDMBased()) {
    return t("error.invalid");
  }
  const missing = await missingBotPermissionNames(
    guild,
    channel,
    ["ViewChannel", "ReadMessageHistory", "AttachFiles"],
    t
  );
  if (missing) return t("live.missingPermissions", { permissions: missing });

  const [mine, guildTotal] = await Promise.all([
    liveStore.countActive({ guildId, ownerId: user.id }),
    liveStore.countActive({ guildId }),
  ]);
  if (mine >= MAX_WATCHES_PER_MEMBER) {
    return t("live.limitMember", { count: MAX_WATCHES_PER_MEMBER });
  }
  if (guildTotal >= MAX_WATCHES_PER_GUILD) {
    return t("live.limitGuild", { count: MAX_WATCHES_PER_GUILD });
  }
  return null;
}
