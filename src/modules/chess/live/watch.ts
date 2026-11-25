import { randomUUID } from "node:crypto";
import type { TFunction } from "#lib/i18n.js";
import { editable, type ChessEditMessage } from "../views.js";
import type { LiveSnapshot } from "./sources.js";
import liveStore from "./store.service.js";
import type { LiveGame } from "./types.js";
import { liveMessage } from "./views.js";
import watcher from "./watcher.service.js";

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
