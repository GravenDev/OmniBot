import {
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import type { CompatibleInteraction } from "#lib/interaction.js";

type GuardedInteraction =
  | CompatibleInteraction
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction;

export async function requireAdmin(
  interaction: GuardedInteraction,
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

export async function requirePermissions(
  interaction: GuardedInteraction,
  permissions: bigint,
  t: TFunction
): Promise<boolean> {
  if (!interaction.memberPermissions?.has(permissions)) {
    await interaction.reply({
      content: t("interaction.memberMissingPermissions"),
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}
