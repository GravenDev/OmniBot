import {
  type Message,
  type MessageReaction,
  ReactionType,
  type User,
} from "discord.js";
import { matchesEmoji } from "#lib/config.js";

export interface EmojiCount {
  emoji: string;
  count: number;
}

export interface Tally {
  reactions: EmojiCount[];
  total: number;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

function counted(message: Message, emojis: string[]): MessageReaction[] {
  return [...message.reactions.cache.values()].filter((reaction) =>
    emojis.some((emoji) => matchesEmoji(emoji, reaction.emoji))
  );
}

export function upperBound(message: Message, emojis: string[]): number {
  return counted(message, emojis).reduce(
    (sum, reaction) => sum + reaction.count,
    0
  );
}

async function reactors(reaction: MessageReaction): Promise<User[]> {
  const users = new Map<string, User>();
  const types = [ReactionType.Normal];
  if (reaction.countDetails?.burst) {
    types.push(ReactionType.Burst);
  }
  for (const type of types) {
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await reaction.users.fetch(
        after ? { type, limit: PAGE_SIZE, after } : { type, limit: PAGE_SIZE }
      );
      for (const user of batch.values()) {
        users.set(user.id, user);
      }
      if (batch.size < PAGE_SIZE) {
        break;
      }
      after = batch.lastKey();
    }
  }
  return [...users.values()];
}

export async function tallyReactions(
  message: Message,
  emojis: string[],
  selfStar: boolean
): Promise<Tally> {
  const members = new Set<string>();
  const reactions: EmojiCount[] = [];
  for (const reaction of counted(message, emojis)) {
    const ids = (await reactors(reaction))
      .filter(
        (user) => !user.bot && (selfStar || user.id !== message.author.id)
      )
      .map((user) => user.id);
    if (ids.length === 0) {
      continue;
    }
    reactions.push({ emoji: reaction.emoji.toString(), count: ids.length });
    for (const id of ids) {
      members.add(id);
    }
  }
  return { reactions, total: members.size };
}
