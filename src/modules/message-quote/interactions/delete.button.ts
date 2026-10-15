import {
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export const QUOTE_CUSTOM_ID = "message-quote";

export function deleteButton(t: TFunction, allowedUserIds: string[]) {
  return new ButtonBuilder()
    .setCustomId([QUOTE_CUSTOM_ID, ...new Set(allowedUserIds)].join(":"))
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
      await interaction.reply({
        content: config.t("delete.notAllowed"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.message.delete();
  },
});
