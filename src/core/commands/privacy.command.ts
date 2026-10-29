import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { declareCommand } from "#lib/command.js";

export const PRIVACY_DELETE_ID = "privacy-delete";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Manage the data the bot keeps about you")
    .setDescriptionLocalizations({
      fr: "Gérer les données que le bot garde sur vous",
    })
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription(
          "Delete the data the bot keeps about you on this server"
        )
        .setDescriptionLocalizations({
          fr: "Supprimer les données que le bot garde sur vous sur ce serveur",
        })
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    await interaction.reply({
      content: config.t("privacy.confirm"),
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(PRIVACY_DELETE_ID)
            .setLabel(config.t("privacy.confirmButton"))
            .setStyle(ButtonStyle.Danger)
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
});
