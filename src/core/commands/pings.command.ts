import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import mentionService from "#core/services/mention.service.js";
import { declareCommand } from "#lib/command.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("pings")
    .setDescription("Choose whether the bot's announcements ping you")
    .setDescriptionLocalizations({
      fr: "Choisir si les annonces du bot vous mentionnent",
    })
    .setContexts([InteractionContextType.Guild])
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Be pinged by the bot's announcements on this server")
        .setDescriptionLocalizations({
          fr: "Être mentionné par les annonces du bot sur ce serveur",
        })
        .setRequired(true)
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    const enabled = interaction.options.getBoolean("enabled", true);
    await mentionService.setMentionable(
      interaction.guildId,
      interaction.user.id,
      enabled
    );
    await interaction.reply({
      content: config.t(enabled ? "pings.enabled" : "pings.disabled"),
      flags: MessageFlags.Ephemeral,
    });
  },
});
