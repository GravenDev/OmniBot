import type { ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { replyEphemeral } from "#lib/reply.js";
import store from "../services/session.service.js";
import type { ChessSession } from "../types.js";
import { chessView, errorMessage } from "../views.js";
import { ownedSession } from "./common.js";
import { respondToButton } from "./response.js";

function navigationPatch(
  action: string | undefined,
  total: number,
  session: ChessSession
): Partial<ChessSession> | null {
  switch (action) {
    case "first":
      return { ply: 0 };
    case "last":
      return { ply: total };
    case "prev":
      return { ply: Math.max(0, session.ply - 1) };
    case "next":
      return { ply: Math.min(total, session.ply + 1) };
    case "flip":
      return { flipped: !session.flipped };
    default:
      return null;
  }
}

export default declareInteractionHandler<ButtonInteraction>({
  customId: "chess-nav",
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [sessionId, action], config) {
    const session = await ownedSession(interaction, sessionId!, config.t);
    if (!session?.parsed) {
      if (session) await interaction.reply(errorMessage(config.t, "error.pgn"));
      return;
    }

    const total = session.parsed.steps.length;
    const patch = navigationPatch(action, total, session);
    if (!patch) {
      await replyEphemeral(interaction, config.t("error.invalid"));
      return;
    }

    const updated = store.update(session.id, patch) ?? session;
    await respondToButton(
      interaction,
      await chessView(updated, config.t, updated.view),
      true
    );
  },
});
