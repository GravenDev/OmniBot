import {
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  PermissionFlagsBits,
} from "discord.js";
import { excludedIdsOf, isExcluded } from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import { LogThrottle } from "#lib/log-throttle.js";
import { loggerMaker } from "#lib/logger.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";

const logger = loggerMaker("message-log");
const warnings = new LogThrottle();

export interface LogTarget {
  channel: GuildTextBasedChannel;
  withFiles: boolean;
}

const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

export function logTargetFor(
  source: GuildBasedChannel | null,
  config: ConfigProvider<MessageLogConfigSchema>
): LogTarget | null {
  const logChannel = config.get("logChannel");
  if (!source) {
    return null;
  }
  if (!logChannel) {
    logger.debug(
      `Log skipped | reason = no log channel | guildId = ${source.guild.id} | channelId = ${source.id}`
    );
    return null;
  }
  if (!logChannel.isSendable() || logChannel.isDMBased()) {
    logger[warnings.level(`unsendable:${logChannel.id}`)](
      `Log skipped | reason = log channel not sendable | guildId = ${source.guild.id} | logChannelId = ${logChannel.id}`
    );
    return null;
  }
  const excludedIds = excludedIdsOf(
    config.get("excludedChannels"),
    config.get("excludedCategories")
  );
  excludedIds.add(logChannel.id);
  if (isExcluded(source, excludedIds)) {
    logger.debug(
      `Log skipped | reason = excluded channel | guildId = ${source.guild.id} | channelId = ${source.id}`
    );
    return null;
  }
  const me = logChannel.guild.members.me;
  const permissions = me ? logChannel.permissionsFor(me) : null;
  if (permissions && !permissions.has(REQUIRED_PERMISSIONS)) {
    logger[warnings.level(`permissions:${logChannel.id}`)](
      `Log skipped | reason = missing permissions | guildId = ${source.guild.id} | logChannelId = ${logChannel.id} | missing = ${permissions.missing(REQUIRED_PERMISSIONS).join(",")}`
    );
    return null;
  }
  return {
    channel: logChannel,
    withFiles: !permissions || permissions.has(PermissionFlagsBits.AttachFiles),
  };
}
