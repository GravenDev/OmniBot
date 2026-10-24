import {
  ChannelType,
  MessageFlags,
  type ModalSubmitInteraction,
  type PermissionsString,
} from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import { missingBotPermissions } from "#lib/permissions.js";
import { STICKY_MODAL_ID } from "#modules/sticky/commands/sticky.command.js";
import poster from "#modules/sticky/services/poster.js";

const logger = loggerMaker("sticky");

const REQUIRED_PERMISSIONS: PermissionsString[] = [
  "ViewChannel",
  "SendMessages",
];

export default declareInteractionHandler<ModalSubmitInteraction>({
  customId: STICKY_MODAL_ID,
  access: "admin",
  check: (interaction): interaction is ModalSubmitInteraction =>
    interaction.isModalSubmit(),
  execute: async (interaction, [channelId], config) => {
    if (!interaction.inCachedGuild()) {
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = channelId
      ? interaction.guild.channels.cache.get(channelId)
      : undefined;
    if (
      channel?.type !== ChannelType.GuildText &&
      channel?.type !== ChannelType.GuildAnnouncement
    ) {
      await interaction.editReply(config.t("set.unknownChannel"));
      return;
    }
    const content = interaction.fields.getTextInputValue("content").trim();
    if (!content) {
      await interaction.editReply(config.t("set.empty"));
      return;
    }

    const missing = await missingBotPermissions(
      interaction.guild,
      channel,
      REQUIRED_PERMISSIONS
    );
    if (missing.length > 0) {
      await interaction.editReply(
        config.t("set.missingPermissions", {
          channel: `<#${channel.id}>`,
          permissions: missing
            .map((permission) => config.t(`permission.${permission}`))
            .join(", "),
        })
      );
      return;
    }

    const posted = await poster.set(channel, content);
    logger.info(
      `Sticky set | guildId = ${interaction.guildId} | channelId = ${channel.id} | posted = ${posted} | by = ${interaction.user.id}`
    );
    await interaction.editReply(
      config.t(posted ? "set.done" : "set.notPosted", {
        channel: `<#${channel.id}>`,
      })
    );
  },
});
