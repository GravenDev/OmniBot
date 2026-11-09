import type { REST } from "discord.js";
import {
  searchGuildMessages,
  type SearchMessage,
} from "#lib/discord-polyfills/guild-message-search.js";
import { parseClashLinks } from "./links.js";

// Discord's message search (#lib/discord-polyfills/guild-message-search.ts).
// `link_hostname` takes the registrable domain: "codingame.com" matches the
// www. links, the reverse finds nothing. Results come 25 at a time, oldest
// first, and the next page starts after the last message seen (`min_id`),
// which `offset` (capped at 9975) could not. Age-restricted channels are left
// out unless `include_nsfw`.
const PAGE_SIZE = 25;
const HOSTNAME = "codingame.com";

export interface LinkedClash {
  handle: string;
  channelId: string;
  messageId: string;
}

/** Where a channel search stands: it can resume from there. */
export interface SearchState {
  /** The last message read: the next page starts after it. */
  after: string | undefined;
  /** Every game found so far, with the first message that posted it. */
  found: Map<string, LinkedClash>;
  messages: number;
}

export function newSearchState(): SearchState {
  return { after: undefined, found: new Map(), messages: 0 };
}

export interface SearchOptions {
  /** No page is asked for, nor waited for, past this time (epoch ms). */
  deadline?: number;
  onProgress?: (progress: SearchProgress) => void;
}

export interface SearchProgress {
  /** Messages read so far, all of them holding a CodinGame link. */
  messages: number;
  /** Distinct games found so far. */
  found: number;
}

// The next page, or null when the deadline comes first.
async function searchPage(
  rest: REST,
  guildId: string,
  channelId: string,
  after: string | undefined,
  deadline: number
): Promise<SearchMessage[] | null> {
  const query = new URLSearchParams({
    channel_id: channelId,
    link_hostname: HOSTNAME,
    include_nsfw: "true",
    sort_by: "timestamp",
    sort_order: "asc",
    limit: String(PAGE_SIZE),
    ...(after && { min_id: after }),
  });
  return searchGuildMessages(rest, guildId, query, deadline);
}

/**
 * Reads the clashes linked in a channel into `state`, oldest first, each with
 * the first message that posted it; links posted by bots are skipped, as the
 * listener does. Returns true once the channel is read to its end, false when
 * the deadline stopped it: called again with the same state, it goes on.
 */
export async function searchChannelClashes(
  rest: REST,
  guildId: string,
  channelId: string,
  state: SearchState,
  {
    deadline = Number.POSITIVE_INFINITY,
    onProgress = () => undefined,
  }: SearchOptions = {}
): Promise<boolean> {
  for (;;) {
    if (Date.now() >= deadline) {
      return false;
    }
    const messages = await searchPage(
      rest,
      guildId,
      channelId,
      state.after,
      deadline
    );
    if (messages === null) {
      return false;
    }
    const last = messages.at(-1);
    if (!last || last.id === state.after) {
      return true;
    }
    for (const message of messages) {
      if (message.author?.bot) {
        continue;
      }
      for (const handle of parseClashLinks(message.content ?? "")) {
        if (!state.found.has(handle)) {
          state.found.set(handle, {
            handle,
            channelId: message.channel_id,
            messageId: message.id,
          });
        }
      }
    }
    state.messages += messages.length;
    onProgress({ messages: state.messages, found: state.found.size });
    state.after = last.id;
  }
}
