import type {
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { NO_MENTIONS_REPLY } from "#lib/mentions.js";
import { replyEphemeral } from "#lib/reply.js";
import { parseGame } from "../games/pgn.js";
import { playerSide } from "../ratings.js";
import store from "../services/session.service.js";
import type { ChessSession, ParsedGame } from "../types.js";

export type ChessInteraction =
  | MessageComponentInteraction
  | ModalSubmitInteraction;

export async function ownedSession(
  interaction: ChessInteraction,
  id: string,
  t: TFunction
): Promise<ChessSession | null> {
  const session = store.get(id);
  if (!session) {
    await replyEphemeral(interaction, t("error.expired"));
    return null;
  }
  if (session.ownerId !== interaction.user.id) {
    await replyEphemeral(
      interaction,
      t("error.notOwner", { user: `<@${session.ownerId}>` }),
      NO_MENTIONS_REPLY
    );
    return null;
  }
  return session;
}

export function selectGame(
  session: ChessSession,
  index: number
): ParsedGame | null {
  const game = session.games[index];
  if (!game) return null;
  const parsed = parseGame(game.pgn);
  if (!parsed) return null;
  store.setParsed(session.id, parsed);
  // For username requests there is no side option: every pick re-derives the
  // colour of the requested account, which may change from game to game.
  const side = playerSide(game, session.requestedPlayer);
  // The account asked for in the command always sits at the bottom; the
  // flip button can still turn the board around afterwards.
  store.update(session.id, {
    gameIndex: index,
    flipped: side === "black",
    ...(side ? { side } : {}),
  });
  return parsed;
}
