import type { Message, TextBasedChannel } from "discord.js";
import type { ChannelMessage } from "./four-hour-game.service.js";

const HISTORY_DEPTH = 50;

export function isPlayerMessage(
  message: Pick<Message, "author" | "system">
): boolean {
  return !message.author.bot && !message.system;
}

export async function fetchLatestPlayerMessage(
  channel: TextBasedChannel
): Promise<ChannelMessage | null> {
  const messages = await channel.messages.fetch({ limit: HISTORY_DEPTH });
  const latest = [...messages.values()]
    .filter(isPlayerMessage)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];

  return latest
    ? {
        messageId: latest.id,
        authorId: latest.author.id,
        sentAt: latest.createdAt,
      }
    : null;
}
