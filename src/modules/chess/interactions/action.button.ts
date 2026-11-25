import type { ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import { replyEphemeral } from "#lib/reply.js";
import { runAnalysis } from "../analysis/run.js";
import store from "../services/session.service.js";
import type { ChessView } from "../types.js";
import { chessView, errorMessage, withNotice } from "../views.js";
import { ownedSession } from "./common.js";
import { beginButtonEdit, respondToButton } from "./response.js";

const logger = loggerMaker("chess");

function viewOfAction(action: string): ChessView {
  if (action === "report") return "report";
  if (action === "analyse") return "analyse";
  return "board";
}

export default declareInteractionHandler<ButtonInteraction>({
  customId: "chess-action",
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [sessionId, action], config) {
    if (!["analyse", "report", "board", "opponent"].includes(action ?? "")) {
      await replyEphemeral(interaction, config.t("error.invalid"));
      return;
    }
    const session = await ownedSession(interaction, sessionId!, config.t);
    if (!session) return;
    if (!session.parsed) {
      await interaction.reply(errorMessage(config.t, "error.pgn"));
      return;
    }

    if (action === "board") {
      store.update(session.id, { view: "board" });
      await respondToButton(
        interaction,
        await chessView(session, config.t),
        true
      );
      return;
    }

    if (action === "opponent") {
      if (!session.analysis) {
        await replyEphemeral(interaction, config.t("error.invalid"));
        return;
      }
      store.update(session.id, {
        side: session.side === "white" ? "black" : "white",
        view: "report",
      });
      await respondToButton(
        interaction,
        await chessView(session, config.t),
        true
      );
      return;
    }

    const view = viewOfAction(action ?? "");
    if (session.analysis) {
      store.update(session.id, { view });
      await respondToButton(
        interaction,
        await chessView(session, config.t),
        true
      );
      return;
    }

    // Neither analysis tab can render before the engine has run: show the game
    // with the status container in the meantime, then open the requested tab.
    store.update(session.id, { view: "board" });
    const current = await chessView(session, config.t);
    const edit = await beginButtonEdit(interaction);
    await edit(withNotice(current, config.t("viewer.analysing")));
    try {
      await runAnalysis(session);
    } catch (error) {
      logger.error({ err: error }, "Chess analysis failed from viewer");
      await edit(withNotice(current, config.t("error.analysis")));
      return;
    }

    store.update(session.id, { view });
    const result = await chessView(session, config.t);
    try {
      await edit(result);
    } catch (error) {
      // Only a failed edit falls back to a fresh message: the analysis is
      // valid and must not be lost because Discord refused the edit.
      logger.error(
        { err: error },
        "Chess result message update failed from viewer"
      );
      await interaction.followUp(result);
    }
  },
});
