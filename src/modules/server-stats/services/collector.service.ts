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
import { dayOf, hourOf } from "#modules/server-stats/day.js";
import { emojiKey } from "#modules/server-stats/emoji.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import { countedChannelId, isTracked } from "#modules/server-stats/tracking.js";
import store from "./store.service.js";

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
  const day = dayOf(message.createdAt);
  const joinedAt = message.member?.joinedAt;
  await store.recordMessage(
    message.guildId,
    day,
    hourOf(message.createdAt),
    countedChannelId(message.channel),
    message.author.id,
    joinedAt ? dayOf(joinedAt).getTime() === day.getTime() : false
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
