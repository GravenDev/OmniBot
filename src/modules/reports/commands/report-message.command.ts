import {
  ActionRowBuilder,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { declareCommand } from "#lib/command.js";
import type { ReportsConfigSchema } from "../reports.config.js";
import { ineligibility } from "../services/report.service.js";

export const REPORT_MODAL_ID = "report-menu-modal";
export const REASON_MAX = 500;

export default declareCommand<
  ReportsConfigSchema,
  MessageContextMenuCommandInteraction
>({
  data: new ContextMenuCommandBuilder()
    .setName("Report message")
    .setNameLocalizations({ fr: "Signaler le message" })
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, config) {
    const alertChannel = config.get("alertChannel");
    const message = interaction.targetMessage;
    if (!alertChannel?.isSendable() || !message.inGuild()) {
      await interaction.reply({
        content: config.t("menu.unconfigured"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const blocked = ineligibility(
      message,
      interaction.user.id,
      alertChannel.id
    );
    if (blocked) {
      await interaction.reply({
        content: config.t(`menu.ineligible.${blocked}`),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`${REPORT_MODAL_ID}:${message.channelId}:${message.id}`)
        .setTitle(config.t("menu.title"))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel(config.t("menu.reason"))
              .setPlaceholder(config.t("menu.reasonPlaceholder"))
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(REASON_MAX)
          )
        )
    );
  },
});
