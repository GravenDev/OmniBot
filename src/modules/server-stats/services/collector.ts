import type {
  GuildMember,
  Message,
  MessageReaction,
  PartialGuildMember,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import { dayOf } from "./day.js";
import store from "./store.js";
import { countedChannelId, isTracked } from "./tracking.js";

type Config = ConfigProvider<ServerStatsConfigSchema>;

export async function collectMessage(
  message: Message,
  config: Config
): Promise<void> {
  if (message.author.bot || message.system || !message.inGuild()) {
    return;
  }
  if (!isTracked(message.channel, config)) {
    return;
  }
  await store.recordMessage(
    message.guildId,
    dayOf(message.createdAt),
    countedChannelId(message.channel),
    message.author.id
  );
}

async function isBot(user: User | PartialUser): Promise<boolean> {
  if (!user.partial) {
    return user.bot;
  }
  const fetched = await user.fetch().catch(() => null);
  return fetched?.bot ?? true;
}

export async function collectReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  config: Config,
  now = new Date()
): Promise<void> {
  const { message } = reaction;
  if (!message.inGuild() || !isTracked(message.channel, config)) {
    return;
  }
  const emoji = emojiKey(reaction.emoji);
  if (!emoji || (await isBot(user))) {
    return;
  }
  await store.recordReaction(message.guildId, dayOf(now), emoji);
}

export function emojiKey(emoji: {
  id: string | null;
  name: string | null;
  animated?: boolean | null;
}): string | null {
  if (emoji.id) {
    return `<${emoji.animated ? "a" : ""}:e:${emoji.id}>`;
  }
  return emoji.name;
}

export async function collectMemberChange(
  member: GuildMember | PartialGuildMember,
  change: "joins" | "leaves",
  now = new Date()
): Promise<void> {
  if (member.user.bot) {
    return;
  }
  await store.recordMemberChange(member.guild.id, dayOf(now), change);
}
