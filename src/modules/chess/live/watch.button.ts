import type { ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import { ownedSession } from "../interactions/common.js";
import { errorMessage } from "../views.js";
import { gameFromUrl } from "./sources.js";
import { startWatchFlow } from "./watch.js";

const logger = loggerMaker("chess");

/** The list's green "Regarder" button: same public watch as `/chess watch`. */
export default declareInteractionHandler<ButtonInteraction>({
  customId: "chess-watch",
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [sessionId, rawIndex], config) {
    const session = await ownedSession(interaction, sessionId!, config.t);
    if (!session) return;

    const game = session.games[Number(rawIndex)];
    if (
      session.mode !== "view" ||
      !game?.ongoing ||
      !game.url ||
      !interaction.guildId
    ) {
      await interaction.reply(errorMessage(config.t, "error.invalid"));
      return;
    }

    // The list stays as it is; the watch itself is published in the channel.
    await interaction.deferUpdate();
    try {
      const snapshot = await gameFromUrl(game.url);
      if (!snapshot || snapshot.finished) {
        await interaction.followUp(errorMessage(config.t, "live.noGame"));
        return;
      }
      await startWatchFlow(snapshot, {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        ownerId: interaction.user.id,
        requestedPlayer: session.requestedPlayer,
        t: config.t,
        send: (message) => interaction.followUp(message),
      });
    } catch (error) {
      logger.error({ err: error }, "Chess watch from list failed");
      await interaction.followUp(errorMessage(config.t, "error.url"));
    }
  },
});
