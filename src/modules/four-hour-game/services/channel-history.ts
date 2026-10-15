import type { Message, TextBasedChannel } from "discord.js";
import type { ChannelMessage } from "./four-hour-game.service.js";

const HISTORY_DEPTH = 50;

export function isPlayerMessage(
  message: Pick<Message, "author" | "system">
): boolean {
  return !message.author.bot && !message.system;
}

export async function fetchPlayerMessages(
  channel: TextBasedChannel
): Promise<ChannelMessage[]> {
  const messages = await channel.messages.fetch({ limit: HISTORY_DEPTH });
  return [...messages.values()]
    .filter(isPlayerMessage)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => ({
      messageId: message.id,
      authorId: message.author.id,
      sentAt: message.createdAt,
    }));
}

export function standingOf(
  chronological: readonly ChannelMessage[]
): ChannelMessage | null {
  let standing = chronological.at(-1) ?? null;
  for (let i = chronological.length - 2; i >= 0; i--) {
    const message = chronological[i]!;
    if (message.authorId !== standing!.authorId) {
      break;
    }
    standing = message;
  }
  return standing;
}

export async function fetchStandingMessage(
  channel: TextBasedChannel
): Promise<ChannelMessage | null> {
  return standingOf(await fetchPlayerMessages(channel));
}
