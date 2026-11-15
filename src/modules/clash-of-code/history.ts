import type { SearchMessage } from "#lib/discord-polyfills/guild-message-search.js";
import { parseClashLinks } from "./links.js";

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

export interface SearchProgress {
  /** Messages read so far, all of them holding a CodinGame link. */
  messages: number;
  /** Distinct games found so far. */
  found: number;
}

/**
 * Adds the clashes linked in a page of search results to `state`, each with
 * the first message that posted it; links posted by bots are skipped, as the
 * listener does.
 */
export function recordPage(
  state: SearchState,
  messages: SearchMessage[]
): void {
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
}
