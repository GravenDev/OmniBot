import type { Message, TextBasedChannel } from "discord.js";
import type { ChannelMessage } from "./four-hour-game.service.js";

const HISTORY_DEPTH = 50;

export function isPlayerMessage(
  message: Pick<Message, "author" | "system">
): boolean {
  return !message.author.bot && !message.system;
}

export async function fetchStandingMessage(
  channel: TextBasedChannel
): Promise<ChannelMessage | null> {
  const messages = await channel.messages.fetch({ limit: HISTORY_DEPTH });
  const [latest, ...older] = [...messages.values()]
    .filter(isPlayerMessage)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  if (!latest) {
    return null;
  }

  let standing = latest;
  for (const message of older) {
    if (message.author.id !== latest.author.id) {
      break;
    }
    standing = message;
  }
  return {
    messageId: standing.id,
    authorId: standing.author.id,
    sentAt: standing.createdAt,
  };
}
