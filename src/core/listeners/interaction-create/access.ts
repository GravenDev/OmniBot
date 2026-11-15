import {
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import type { Command } from "#lib/command.js";
import type { TFunction } from "#lib/i18n.js";
import type {
  CompatibleInteraction,
  InteractionAccess,
} from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("core");

// The interactions a member may be refused, with a reply.
export type GuardedInteraction =
  | CompatibleInteraction
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction;

// A command declares its access with requiresAdmin, a button, menu or modal
// handler with access: both go through the same check.
export function commandAccess(
  command: Pick<Command, "requiresAdmin">
): InteractionAccess {
  return command.requiresAdmin ? "admin" : "everyone";
}

// Whether the member behind the interaction may use what declares `access`;
// when not, replies with the ephemeral refusal and returns false.
export async function checkAccess(
  interaction: GuardedInteraction,
  access: InteractionAccess,
  t: TFunction
): Promise<boolean> {
  if (access === "everyone") {
    return true;
  }
  if (access === "admin") {
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      logger.debug(
        `Admin access refused | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
      );
      await interaction.reply({
        content: t("admin.noPermission"),
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }
    return true;
  }
  if (!interaction.memberPermissions?.has(access.permissions)) {
    logger.debug(
      `Missing member permissions | permissions = ${access.permissions} | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
    );
    await interaction.reply({
      content: t("interaction.memberMissingPermissions"),
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}
