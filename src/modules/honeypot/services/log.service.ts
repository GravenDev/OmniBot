import { PermissionFlagsBits, type Message } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { declareService, type Service } from "#lib/service.js";
import type { HoneypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import { trapLog } from "#modules/honeypot/log.js";
import type { TrapResult } from "#modules/honeypot/trap.js";

const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

const logger = loggerMaker("honeypot");

/** The trap log, posted in the log channel. */
export class LogService implements Service {
  async logTrap(
    message: Message<true>,
    config: ConfigProvider<HoneypotConfigSchema>,
    result: TrapResult,
    purgeSeconds: number
  ): Promise<void> {
    const channel = config.get("logChannel");
    if (!channel) {
      logger.debug(
        `Trap log skipped | reason = no log channel | guildId = ${message.guildId}`
      );
      return;
    }
    if (!channel.isSendable() || channel.isDMBased()) {
      logger.warn(
        `Trap log skipped | reason = log channel not sendable | guildId = ${message.guildId} | logChannelId = ${channel.id}`
      );
      return;
    }
    const me = channel.guild.members.me;
    if (me && !channel.permissionsFor(me).has(REQUIRED_PERMISSIONS)) {
      logger.warn(
        `Trap log skipped | reason = missing permissions | guildId = ${message.guildId} | logChannelId = ${channel.id}`
      );
      return;
    }
    try {
      await channel.send({
        embeds: [trapLog(message, config.t, result, purgeSeconds)],
        allowedMentions: NO_MENTIONS,
      });
    } catch (error) {
      logger.warn(
        { err: error, guildId: message.guildId },
        "Honeypot log could not be posted"
      );
    }
  }
}

export default declareService(new LogService());
