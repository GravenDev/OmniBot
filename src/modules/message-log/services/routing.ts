import type { GuildBasedChannel, SendableChannels } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";

export function isExcluded(
  channel: GuildBasedChannel,
  excludedIds: ReadonlySet<string>
): boolean {
  const ids = [channel.id, channel.parentId];
  if (channel.isThread()) {
    ids.push(channel.parent?.parentId ?? null);
  }
  return ids.some((id) => id !== null && excludedIds.has(id));
}

export function logChannelFor(
  source: GuildBasedChannel | null,
  config: ConfigProvider<MessageLogConfigSchema>
): SendableChannels | null {
  const logChannel = config.get("logChannel");
  if (!source || !logChannel?.isSendable()) {
    return null;
  }
  const excludedIds = new Set(
    (config.get("excludedChannels") ?? []).map((excluded) => excluded.id)
  );
  excludedIds.add(logChannel.id);
  return isExcluded(source, excludedIds) ? null : logChannel;
}
