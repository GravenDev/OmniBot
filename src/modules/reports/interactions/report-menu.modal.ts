import {
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type ModalSubmitInteraction,
} from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import { REPORT_MODAL_ID } from "../commands/report-message.command.js";
import type { ReportsConfigSchema } from "../reports.config.js";
import reportService, {
  canPost,
  ineligibility,
  snapshotOf,
} from "../services/report.service.js";

const logger = loggerMaker("reports");

export default declareInteractionHandler<
  ModalSubmitInteraction,
  ReportsConfigSchema
>({
  customId: REPORT_MODAL_ID,
  access: "everyone",
  check: (interaction): interaction is ModalSubmitInteraction =>
    interaction.isModalSubmit(),
  execute: async (interaction, [channelId, messageId], config) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const alertChannel = config.get("alertChannel");
    if (!canPost(alertChannel) || !channelId || !messageId) {
      await interaction.editReply(config.t("menu.unconfigured"));
      return;
    }

    let message;
    try {
      const channel = await interaction.guild!.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        throw new Error(`Not a text channel | channelId = ${channelId}`);
      }
      message = await channel.messages.fetch(messageId);
    } catch (err) {
      const noAccess =
        err instanceof DiscordAPIError &&
        (err.code === RESTJSONErrorCodes.MissingAccess ||
          err.code === RESTJSONErrorCodes.MissingPermissions);
      logger.info(
        { err },
        `Reported message unreadable | messageId = ${messageId}`
      );
      await interaction.editReply(
        config.t(noAccess ? "menu.noAccess" : "menu.gone")
      );
      return;
    }

    const blocked = ineligibility(
      message,
      interaction.user.id,
      alertChannel.id
    );
    if (blocked) {
      await interaction.editReply(config.t(`menu.ineligible.${blocked}`));
      return;
    }

    const reason =
      interaction.fields.getTextInputValue("reason").trim() || null;
    const outcome = await reportService.report(
      interaction.client,
      config,
      snapshotOf(message),
      { userId: interaction.user.id, source: "menu", reason },
      false
    );
    await interaction.editReply(config.t(`menu.outcome.${outcome}`));
  },
});
