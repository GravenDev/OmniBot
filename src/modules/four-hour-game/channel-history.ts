import type { Message } from "discord.js";
import type { ChannelMessage } from "./types.js";

export function isPlayerMessage(
  message: Pick<Message, "author" | "system">
): boolean {
  return !message.author.bot && !message.system;
}

/** The player messages among `messages`, oldest first. */
export function toChannelMessages(
  messages: Iterable<Message>
): ChannelMessage[] {
  return [...messages]
    .filter(isPlayerMessage)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => ({
      messageId: message.id,
      authorId: message.author.id,
      sentAt: message.createdAt,
    }));
}

export function oldestOf(messages: readonly Message[]): Message | undefined {
  return messages.reduce<Message | undefined>(
    (found, message) =>
      !found || message.createdTimestamp < found.createdTimestamp
        ? message
        : found,
    undefined
  );
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
