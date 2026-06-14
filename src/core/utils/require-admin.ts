import { MessageFlags, PermissionFlagsBits } from "discord.js";
import type { CompatibleInteraction } from "#lib/interaction.js";

export async function requireAdmin(
  interaction: CompatibleInteraction
): Promise<boolean> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "You do not have permission to manage modules.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}
