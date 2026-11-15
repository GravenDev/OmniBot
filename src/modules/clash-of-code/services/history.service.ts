import type { REST } from "discord.js";
import {
  searchGuildMessages,
  type SearchMessage,
} from "#lib/discord-polyfills/guild-message-search.js";
import { declareService, type Service } from "#lib/service.js";
import {
  recordPage,
  type SearchProgress,
  type SearchState,
} from "#modules/clash-of-code/history.js";

// Discord's message search (#lib/discord-polyfills/guild-message-search.ts).
// `link_hostname` takes the registrable domain: "codingame.com" matches the
// www. links, the reverse finds nothing. Results come 25 at a time, oldest
// first, and the next page starts after the last message seen (`min_id`),
// which `offset` (capped at 9975) could not. Age-restricted channels are left
// out unless `include_nsfw`.
const PAGE_SIZE = 25;
const HOSTNAME = "codingame.com";

export interface SearchOptions {
  /** No page is asked for, nor waited for, past this time (epoch ms). */
  deadline?: number;
  onProgress?: (progress: SearchProgress) => void;
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

class HistoryService implements Service {
  /**
   * Reads the clashes linked in a channel into `state`, oldest first (see
   * `recordPage`). Returns true once the channel is read to its end, false
   * when the deadline stopped it: called again with the same state, it goes
   * on.
   */
  async searchChannelClashes(
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
      recordPage(state, messages);
      onProgress({ messages: state.messages, found: state.found.size });
      state.after = last.id;
    }
  }
}

export default declareService(new HistoryService());
