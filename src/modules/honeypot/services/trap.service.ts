import type { GuildMember, Message } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { fetchMember, isBanned } from "#lib/moderation.js";
import { declareService, type Service } from "#lib/service.js";
import type { HoneypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import {
  isExempt,
  isTrap,
  purgeSecondsOf,
  trapNameOf,
  type TrapResult,
} from "#modules/honeypot/trap.js";
import counter from "./counter.service.js";
import log from "./log.service.js";

type Config = ConfigProvider<HoneypotConfigSchema>;

const AUDIT_REASON_LIMIT = 512;
const COOLDOWN_MS = 60_000;

const logger = loggerMaker("honeypot");
interface Cooldown {
  timer: NodeJS.Timeout;
  deleteFollowUps: boolean;
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
    logger.warn(
      `Trap member not bannable | guildId = ${message.guildId} | channelId = ${message.channelId} | userId = ${message.author.id}`
    );
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
    logger.debug(
      `Trap ignored | reason = exempt member | guildId = ${message.guildId} | channelId = ${message.channelId} | userId = ${message.author.id}`
    );
    return null;
  }
  if (!member && (await isBanned(message.guild, message.author.id))) {
    logger.debug(
      `Trap ignored | reason = author already banned | guildId = ${message.guildId} | channelId = ${message.channelId} | userId = ${message.author.id}`
    );
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
  await log.logTrap(message, config, result, purgeSeconds);
  void counter.recordCatch(message.guild, config);
  return result;
}

/** The trap: sanctions whoever posts in a trap channel, once per cooldown. */
export class TrapService implements Service {
  private readonly recent = new Map<string, Cooldown>();

  async springTrap(message: Message, config: Config): Promise<void> {
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
    const current = this.recent.get(key);
    if (current) {
      logger.debug(
        `Trap follow-up ignored | reason = cooldown | guildId = ${message.guildId} | channelId = ${message.channelId} | userId = ${message.author.id} | deleted = ${current.deleteFollowUps}`
      );
      if (current.deleteFollowUps) {
        await removeMessage(message);
      }
      return;
    }
    const cooldown = this.startCooldown(key);
    try {
      const result = await sanction(message, config);
      cooldown.deleteFollowUps =
        result?.outcome === "notBannable" || result?.outcome === "failed";
    } catch (error) {
      this.endCooldown(key);
      throw error;
    }
  }

  private startCooldown(key: string): Cooldown {
    const timer = setTimeout(() => this.recent.delete(key), COOLDOWN_MS);
    timer.unref();
    const cooldown = { timer, deleteFollowUps: false };
    this.recent.set(key, cooldown);
    return cooldown;
  }

  private endCooldown(key: string): void {
    clearTimeout(this.recent.get(key)?.timer);
    this.recent.delete(key);
  }
}

export default declareService(new TrapService());
