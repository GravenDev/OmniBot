import {
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { declareInteractionHandler } from "#lib/interaction.js";

const CUSTOM_ID = "message-quote";

export function deleteButton(t: TFunction, allowedUserIds: string[]) {
  return new ButtonBuilder()
    .setCustomId([CUSTOM_ID, ...new Set(allowedUserIds)].join(":"))
    .setLabel(t("delete.button"))
    .setStyle(ButtonStyle.Secondary);
}

export default declareInteractionHandler<ButtonInteraction>({
  customId: CUSTOM_ID,
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
