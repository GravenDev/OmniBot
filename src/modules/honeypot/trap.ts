import {
  PermissionFlagsBits,
  type GuildMember,
  type GuildTextBasedChannel,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { MAX_BAN_PURGE_SECONDS } from "#lib/moderation.js";
import {
  honeypotConfigSchema,
  type HoneypotConfigSchema,
} from "./honeypot.config.js";

export type Outcome = "softbanned" | "notBannable" | "failed" | "stillBanned";

export interface TrapResult {
  outcome: Outcome;
  messageKept: boolean;
}

export function isTrap(
  channel: GuildTextBasedChannel,
  trapIds: ReadonlySet<string>
): boolean {
  if (trapIds.has(channel.id)) {
    return true;
  }
  return (
    channel.isThread() &&
    channel.parentId !== null &&
    trapIds.has(channel.parentId)
  );
}

export function isExempt(
  member: GuildMember,
  channel: GuildTextBasedChannel,
  exemptRoleIds: ReadonlySet<string>
): boolean {
  return (
    member.guild.ownerId === member.id ||
    channel.permissionsFor(member).has(PermissionFlagsBits.ManageMessages) ||
    member.roles.cache.some((role) => exemptRoleIds.has(role.id))
  );
}

export function purgeSecondsOf(
  config: ConfigProvider<HoneypotConfigSchema>
): number {
  const window =
    config.get("purgeWindow") ?? honeypotConfigSchema.purgeWindow.defaultValue;
  return Math.min(Math.max(Math.floor(window), 0), MAX_BAN_PURGE_SECONDS);
}

export function trapNameOf(channel: GuildTextBasedChannel): string {
  return channel.isThread()
    ? (channel.parent?.name ?? channel.name)
    : channel.name;
}
