import {
  ChannelType,
  type GuildBasedChannel,
  PermissionFlagsBits,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";

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

export function isPublic(channel: GuildBasedChannel): boolean {
  if (channel.type === ChannelType.PrivateThread) {
    return false;
  }
  return (
    channel
      .permissionsFor(channel.guild.roles.everyone)
      ?.has(PermissionFlagsBits.ViewChannel) ?? false
  );
}

export function isTracked(
  channel: GuildBasedChannel,
  config: ConfigProvider<ServerStatsConfigSchema>
): boolean {
  const excludedIds = new Set(
    [
      ...(config.get("excludedChannels") ?? []),
      ...(config.get("excludedCategories") ?? []),
    ].map((excluded) => excluded.id)
  );
  if (isExcluded(channel, excludedIds)) {
    return false;
  }
  return config.get("includePrivateChannels") || isPublic(channel);
}

export function countedChannelId(channel: GuildBasedChannel): string {
  return channel.isThread() ? (channel.parentId ?? channel.id) : channel.id;
}
