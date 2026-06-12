import {
  type ButtonInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";

export async function requireAdmin(
  interaction: ButtonInteraction
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
