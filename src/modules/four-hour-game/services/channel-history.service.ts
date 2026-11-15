import type { Message, TextBasedChannel } from "discord.js";
import {
  isPlayerMessage,
  oldestOf,
  standingOf,
  toChannelMessages,
} from "#modules/four-hour-game/channel-history.js";
import type { ChannelMessage } from "#modules/four-hour-game/types.js";

const HISTORY_DEPTH = 50;
const PAGE_SIZE = 100;
// A safety net: 5,000 messages, more than a day of a busy game channel.
const MAX_PAGES = 50;

export async function fetchPlayerMessages(
  channel: TextBasedChannel
): Promise<ChannelMessage[]> {
  const messages = await channel.messages.fetch({ limit: HISTORY_DEPTH });
  return toChannelMessages(messages.values());
}

// The player messages posted since `since`, plus the one that was in place
// then: pages back until a player message of that time or older is read (bot
// messages, such as the bot's own announcements, cannot be in place), or
// until the page limit.
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
    if (
      batch.length < PAGE_SIZE ||
      batch.some(
        (message) =>
          isPlayerMessage(message) &&
          message.createdTimestamp <= since.getTime()
      )
    ) {
      break;
    }
    before = oldestOf(batch)!.id;
  }
  return toChannelMessages(read);
}

export async function fetchStandingMessage(
  channel: TextBasedChannel
): Promise<ChannelMessage | null> {
  return standingOf(await fetchPlayerMessages(channel));
}
