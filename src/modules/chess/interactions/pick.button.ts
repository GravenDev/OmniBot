import type { ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import { analysisErrorKey, runAnalysis } from "../analysis/run.js";
import { analysingMessage, chessView, errorMessage } from "../views.js";
import { openGame, ownedSession } from "./common.js";
import {
  deferWithEphemeralStatus,
  finishButtonStatus,
  respondToButton,
  updateEphemeralStatus,
} from "./response.js";

const logger = loggerMaker("chess");

export default declareInteractionHandler<ButtonInteraction>({
  customId: "chess-pick",
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [sessionId, rawIndex], config) {
    const list = await ownedSession(interaction, sessionId!, config.t);
    if (!list) return;

    const session = openGame(list, Number(rawIndex));
    if (!session) {
      await interaction.reply(errorMessage(config.t, "error.pgn"));
      return;
    }

    if (session.mode === "view" || session.analysis) {
      await respondToButton(
        interaction,
        await chessView(session, config.t, session.view, false)
      );
      return;
    }

    const flow = await deferWithEphemeralStatus(
      interaction,
      analysingMessage(config.t)
    );
    try {
      await runAnalysis(session);
    } catch (error) {
      logger.error(
        { err: error },
        "Chess analysis failed after game selection"
      );
      await updateEphemeralStatus(
        interaction,
        flow,
        errorMessage(config.t, analysisErrorKey(error))
      );
      return;
    }

    const result = await chessView(session, config.t, session.view, false);
    try {
      await finishButtonStatus(flow, interaction, result);
    } catch (error) {
      // The analysis is valid: a failed message edit must not discard it.
      // Creating a fresh message always works where editing may not.
      logger.error(
        { err: error },
        "Chess result message update failed after game selection"
      );
      await interaction.followUp(result);
    }
  },
});
