import {
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  PermissionFlagsBits,
} from "discord.js";
import { excludedIdsOf, isExcluded } from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";

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
  const excludedIds = excludedIdsOf(
    config.get("excludedChannels"),
    config.get("excludedCategories")
  );
  if (isExcluded(channel, excludedIds)) {
    return false;
  }
  return config.get("includePrivateChannels") || isPublic(channel);
}

export function countedChannelId(channel: GuildBasedChannel): string {
  return channel.isThread() ? (channel.parentId ?? channel.id) : channel.id;
}

/**
 * Whether a counted channel may be named in a report, under the rules as they
 * are now: one excluded, or made private, since its messages were counted is
 * left out. A deleted channel stays, under no name.
 */
export function channelShown(
  guild: Guild,
  config: ConfigProvider<ServerStatsConfigSchema>
): (channelId: string) => boolean {
  return (channelId) => {
    const channel = guild.channels.cache.get(channelId);
    return !channel || isTracked(channel, config);
  };
}
