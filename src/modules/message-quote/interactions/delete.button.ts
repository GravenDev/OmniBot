import {
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
  type ButtonInteraction,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("message-quote");

export const QUOTE_CUSTOM_ID = "message-quote";

export function deleteButton(t: TFunction, allowedUserIds: string[]) {
  return new ButtonBuilder()
    .setCustomId([QUOTE_CUSTOM_ID, ...new Set(allowedUserIds)].join(":"))
    .setEmoji("🗑️")
    .setLabel(t("delete.button"))
    .setStyle(ButtonStyle.Secondary);
}

export default declareInteractionHandler<ButtonInteraction>({
  customId: QUOTE_CUSTOM_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, allowedUserIds, config) {
    const allowed =
      allowedUserIds.includes(interaction.user.id) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
    if (!allowed) {
      logger.debug(
        `Quote deletion refused | reason = not allowed | guildId = ${interaction.guildId} | messageId = ${interaction.message.id} | userId = ${interaction.user.id}`
      );
      await interaction.reply({
        components: [
          new TextDisplayBuilder().setContent(config.t("delete.notAllowed")),
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
      return;
    }
    await interaction.message.delete();
  },
});
