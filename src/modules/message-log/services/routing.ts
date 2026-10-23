import {
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  PermissionFlagsBits,
} from "discord.js";
import {
  excludedIdsOf,
  isExcluded,
  widensAudience,
} from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";

export interface LogTarget {
  channel: GuildTextBasedChannel;
  withContent: boolean;
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
  if (!source || !logChannel?.isSendable() || logChannel.isDMBased()) {
    return null;
  }
  const excludedIds = excludedIdsOf(
    config.get("excludedChannels"),
    config.get("excludedCategories")
  );
  excludedIds.add(logChannel.id);
  if (isExcluded(source, excludedIds)) {
    return null;
  }
  const me = logChannel.guild.members.me;
  const permissions = me ? logChannel.permissionsFor(me) : null;
  if (permissions && !permissions.has(REQUIRED_PERMISSIONS)) {
    return null;
  }
  return {
    channel: logChannel,
    withContent: !widensAudience(source, logChannel),
    withFiles: !permissions || permissions.has(PermissionFlagsBits.AttachFiles),
  };
}
