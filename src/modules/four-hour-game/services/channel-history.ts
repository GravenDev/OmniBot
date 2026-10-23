import type { Message, TextBasedChannel } from "discord.js";
import type { ChannelMessage } from "./types.js";

const HISTORY_DEPTH = 50;
const PAGE_SIZE = 100;
// A safety net: 5,000 messages, more than a day of a busy game channel.
const MAX_PAGES = 50;

export function isPlayerMessage(
  message: Pick<Message, "author" | "system">
): boolean {
  return !message.author.bot && !message.system;
}

function toChannelMessages(messages: Iterable<Message>): ChannelMessage[] {
  return [...messages]
    .filter(isPlayerMessage)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => ({
      messageId: message.id,
      authorId: message.author.id,
      sentAt: message.createdAt,
    }));
}

export async function fetchPlayerMessages(
  channel: TextBasedChannel
): Promise<ChannelMessage[]> {
  const messages = await channel.messages.fetch({ limit: HISTORY_DEPTH });
  return toChannelMessages(messages.values());
}

// The player messages posted since `since`, plus the one that was in place
// then: pages back until a message of that time or older is read, or until
// the page limit.
export async function fetchPlayerMessagesSince(
  channel: TextBasedChannel,
  since: Date
): Promise<ChannelMessage[]> {
  const read: Message[] = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = [
      ...(
        await channel.messages.fetch(
          before ? { limit: PAGE_SIZE, before } : { limit: PAGE_SIZE }
        )
      ).values(),
    ];
    read.push(...batch);
    const oldest = batch.reduce<Message | undefined>(
      (found, message) =>
        !found || message.createdTimestamp < found.createdTimestamp
          ? message
          : found,
      undefined
    );
    if (
      !oldest ||
      batch.length < PAGE_SIZE ||
      oldest.createdTimestamp <= since.getTime()
    ) {
      break;
    }
    before = oldest.id;
  }
  return toChannelMessages(read);
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
