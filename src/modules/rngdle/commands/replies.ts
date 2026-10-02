import { MessageFlags, type RepliableInteraction } from "discord.js";
import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("rngdle");

export async function replyWithError(
  interaction: RepliableInteraction,
  content: string
): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content,
        files: [],
        attachments: [],
        components: [],
        embeds: [],
      });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    logger.warn({ err }, "Could not report an error to the user");
  }
}
