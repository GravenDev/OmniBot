import { MessageFlags, PermissionFlagsBits } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import type { CompatibleInteraction } from "#lib/interaction.js";

export async function requireAdmin(
  interaction: CompatibleInteraction,
  t: TFunction
): Promise<boolean> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: t("admin.noPermission"),
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}
