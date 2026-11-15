import type { Message, MessageReaction } from "discord.js";
import { matchesEmoji } from "#lib/config.js";

export interface EmojiCount {
  emoji: string;
  count: number;
}

export interface Tally {
  reactions: EmojiCount[];
  total: number;
}

export interface Reactors {
  emoji: string;
  users: { id: string; bot: boolean }[];
}

export function countedReactions(
  message: Message,
  emojis: string[]
): MessageReaction[] {
  return [...message.reactions.cache.values()].filter((reaction) =>
    emojis.some((emoji) => matchesEmoji(emoji, reaction.emoji))
  );
}

export function upperBound(message: Message, emojis: string[]): number {
  return countedReactions(message, emojis).reduce(
    (sum, reaction) => sum + reaction.count,
    0
  );
}

export function tallyOf(
  reactors: Reactors[],
  authorId: string,
  selfStar: boolean
): Tally {
  const members = new Set<string>();
  const reactions: EmojiCount[] = [];
  for (const { emoji, users } of reactors) {
    const ids = users
      .filter((user) => !user.bot && (selfStar || user.id !== authorId))
      .map((user) => user.id);
    if (ids.length === 0) {
      continue;
    }
    reactions.push({ emoji, count: ids.length });
    for (const id of ids) {
      members.add(id);
    }
  }
  return { reactions, total: members.size };
}
