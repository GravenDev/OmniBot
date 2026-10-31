import {
  PermissionFlagsBits,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import {
  fetchMember,
  isBanned,
  MAX_BAN_PURGE_SECONDS,
} from "#lib/moderation.js";
import {
  honeypotConfigSchema,
  type HoneypotConfigSchema,
} from "#modules/honeypot/honeypot.config.js";
import { recordCatch } from "./counter.js";
import { logTrap } from "./log.js";

type Config = ConfigProvider<HoneypotConfigSchema>;

export type Outcome = "softbanned" | "notBannable" | "failed" | "stillBanned";

export interface TrapResult {
  outcome: Outcome;
  messageKept: boolean;
}

const AUDIT_REASON_LIMIT = 512;
const COOLDOWN_MS = 60_000;

const logger = loggerMaker("honeypot");
interface Cooldown {
  timer: NodeJS.Timeout;
  deleteFollowUps: boolean;
}

const recent = new Map<string, Cooldown>();

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

export function purgeSecondsOf(config: Config): number {
  const window =
    config.get("purgeWindow") ?? honeypotConfigSchema.purgeWindow.defaultValue;
  return Math.min(Math.max(Math.floor(window), 0), MAX_BAN_PURGE_SECONDS);
}

function startCooldown(key: string): Cooldown {
  const timer = setTimeout(() => recent.delete(key), COOLDOWN_MS);
  timer.unref();
  const cooldown = { timer, deleteFollowUps: false };
  recent.set(key, cooldown);
  return cooldown;
}

function endCooldown(key: string): void {
  clearTimeout(recent.get(key)?.timer);
  recent.delete(key);
}

function trapNameOf(channel: GuildTextBasedChannel): string {
  return channel.isThread()
    ? (channel.parent?.name ?? channel.name)
    : channel.name;
}

async function removeMessage(message: Message<true>): Promise<boolean> {
  try {
    await message.delete();
    return false;
  } catch (error) {
    logger.warn(
      { err: error, guildId: message.guildId, messageId: message.id },
      "Honeypot could not delete the trap message"
    );
    return true;
  }
}

async function softban(
  message: Message<true>,
  member: GuildMember | null,
  purgeSeconds: number,
  reason: string
): Promise<TrapResult> {
  if (member && !member.bannable) {
    return {
      outcome: "notBannable",
      messageKept: await removeMessage(message),
    };
  }
  const bans = message.guild.bans;
  try {
    await bans.create(message.author.id, {
      reason,
      deleteMessageSeconds: purgeSeconds,
    });
  } catch (error) {
    logger.warn(
      { err: error, guildId: message.guildId, userId: message.author.id },
      "Honeypot softban failed"
    );
    return { outcome: "failed", messageKept: await removeMessage(message) };
  }
  try {
    await bans.remove(message.author.id, reason);
  } catch (error) {
    logger.warn(
      { err: error, guildId: message.guildId, userId: message.author.id },
      "Honeypot unban failed"
    );
    return { outcome: "stillBanned", messageKept: false };
  }
  return { outcome: "softbanned", messageKept: false };
}

async function sanction(
  message: Message<true>,
  config: Config
): Promise<TrapResult | null> {
  const member = await fetchMember(message.guild, message.author.id);
  const exemptRoleIds = new Set(
    (config.get("exemptRoles") ?? []).map((role) => role.id)
  );
  if (member && isExempt(member, message.channel, exemptRoleIds)) {
    return null;
  }
  if (!member && (await isBanned(message.guild, message.author.id))) {
    return null;
  }
  const purgeSeconds = purgeSecondsOf(config);
  const reason = config
    .t("auditReason", { channel: trapNameOf(message.channel) })
    .slice(0, AUDIT_REASON_LIMIT);
  const result = await softban(message, member, purgeSeconds, reason);
  logger.info(
    {
      guildId: message.guildId,
      userId: message.author.id,
      outcome: result.outcome,
    },
    "Honeypot triggered"
  );
  await logTrap(message, config, result, purgeSeconds);
  void recordCatch(message.guild, config);
  return result;
}

export async function springTrap(
  message: Message,
  config: Config
): Promise<void> {
  if (
    !message.inGuild() ||
    message.author.bot ||
    message.webhookId ||
    message.system
  ) {
    return;
  }
  const trapIds = new Set(
    (config.get("trapChannels") ?? []).map((channel) => channel.id)
  );
  if (!isTrap(message.channel, trapIds)) {
    return;
  }
  const key = `${message.guildId}:${message.author.id}`;
  const current = recent.get(key);
  if (current) {
    if (current.deleteFollowUps) {
      await removeMessage(message);
    }
    return;
  }
  const cooldown = startCooldown(key);
  try {
    const result = await sanction(message, config);
    cooldown.deleteFollowUps =
      result?.outcome === "notBannable" || result?.outcome === "failed";
  } catch (error) {
    endCooldown(key);
    throw error;
  }
}
