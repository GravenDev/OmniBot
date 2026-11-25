import { randomUUID } from "node:crypto";
import { type ModalSubmitInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import { replyEphemeral } from "#lib/reply.js";
import { runAnalysis } from "../analysis/run.js";
import { PGN_FIELD_IDS } from "../commands/chess.command.js";
import { gameSummaryFromPgn } from "../games/fetch.js";
import store from "../services/session.service.js";
import type { ChessMode, ChessSide } from "../types.js";
import {
  analysingMessage,
  chessView,
  errorMessage,
  preparingMessage,
} from "../views.js";
import { selectGame } from "./common.js";
import { startDirectFlow } from "./response.js";

const logger = loggerMaker("chess");
const MODES = new Set<ChessMode>(["view", "report", "analyse"]);
const SIDES = new Set<ChessSide>(["white", "black"]);

export default declareInteractionHandler<ModalSubmitInteraction>({
  customId: "chess-pgn",
  access: "everyone",
  check: (interaction): interaction is ModalSubmitInteraction =>
    interaction.isModalSubmit(),
  async execute(interaction, [rawMode, rawSide], config) {
    if (!MODES.has(rawMode as ChessMode)) {
      await replyEphemeral(interaction, config.t("error.invalid"));
      return;
    }
    const mode = rawMode as ChessMode;
    const side = SIDES.has(rawSide as ChessSide)
      ? (rawSide as ChessSide)
      : "white";

    const pgn = PGN_FIELD_IDS.map((id) =>
      interaction.fields.getTextInputValue(id)
    )
      .filter(Boolean)
      .join("\n");
    const game = gameSummaryFromPgn(pgn, "pgn", `pgn-${randomUUID()}`, null);
    if (!game) {
      await replyEphemeral(interaction, config.t("error.pgn"));
      return;
    }

    const status =
      mode === "view" ? preparingMessage(config.t) : analysingMessage(config.t);
    const flow = await startDirectFlow(interaction, status);
    try {
      const session = store.create(interaction.user.id, mode, side, [game]);
      if (!selectGame(session, 0)) {
        await flow.fail(errorMessage(config.t, "error.pgn"));
        return;
      }

      if (mode === "view") {
        await flow.complete(
          await chessView(session, config.t, session.view, false)
        );
        return;
      }

      try {
        await runAnalysis(session);
      } catch (error) {
        logger.error({ err: error }, "Chess analysis failed on PGN game");
        await flow.fail(errorMessage(config.t, "error.analysis"));
        return;
      }

      await flow.complete(
        await chessView(session, config.t, session.view, false)
      );
    } catch (error) {
      logger.error({ err: error }, "Chess PGN flow failed");
      await flow.fail(errorMessage(config.t, "error.pgn"));
    }
  },
});
