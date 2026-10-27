import {
  type GuildTextBasedChannel,
  type Message,
  PermissionFlagsBits,
} from "discord.js";
import {
  excludedIdsOf,
  isExcluded,
  isNsfw,
  widensAudience,
} from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import type { StarboardConfigSchema } from "#modules/starboard/starboard.config.js";

type Config = ConfigProvider<StarboardConfigSchema>;

export type Ineligibility =
  | "starboard"
  | "system"
  | "bot"
  | "channel"
  | "nsfw"
  | "audience"
  | "permissions";

const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
];

export function starboardChannelOf(
  config: Config
): GuildTextBasedChannel | null {
  const channel = config.get("channel");
  if (!channel?.isSendable() || channel.isDMBased()) {
    return null;
  }
  return channel;
}

export function thresholdOf(config: Config): number {
  return Math.max(1, Math.floor(config.get("threshold")));
}

export function leakage(
  channel: GuildTextBasedChannel,
  starboard: GuildTextBasedChannel
): "nsfw" | "audience" | null {
  if (isNsfw(channel) && !isNsfw(starboard)) {
    return "nsfw";
  }
  if (widensAudience(channel, starboard)) {
    return "audience";
  }
  return null;
}

export function ineligibility(
  message: Message<true>,
  starboard: GuildTextBasedChannel,
  config: Config
): Ineligibility | null {
  const channel = message.channel;
  const parentId = channel.isThread() ? channel.parentId : null;
  if (channel.id === starboard.id || parentId === starboard.id) {
    return "starboard";
  }
  if (message.system) {
    return "system";
  }
  if (message.author.id === message.client.user.id) {
    return "bot";
  }
  if (config.get("ignoreBots") && (message.author.bot || message.webhookId)) {
    return "bot";
  }
  const allowed = config.get("allowedChannels") ?? [];
  if (
    allowed.length > 0 &&
    !allowed.some(({ id }) => id === channel.id || id === parentId)
  ) {
    return "channel";
  }
  const excludedIds = excludedIdsOf(
    config.get("excludedChannels"),
    config.get("excludedCategories")
  );
  if (isExcluded(channel, excludedIds)) {
    return "channel";
  }
  const leak = leakage(channel, starboard);
  if (leak) {
    return leak;
  }
  const me = starboard.guild.members.me;
  const required = starboard.isThread()
    ? [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessagesInThreads,
      ]
    : REQUIRED_PERMISSIONS;
  if (me && !starboard.permissionsFor(me).has(required)) {
    return "permissions";
  }
  return null;
}
