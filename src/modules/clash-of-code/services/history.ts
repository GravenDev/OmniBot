import { setTimeout as sleep } from "node:timers/promises";
import type { REST } from "discord.js";
import { parseClashLinks } from "./links.js";

// Discord's message search, opened to bots in 2025. `link_hostname` takes the
// registrable domain: "codingame.com" matches the www. links, the reverse finds
// nothing. Results come 25 at a time, oldest first, and the next page starts
// after the last message seen (`min_id`), which `offset` (capped at 9975)
// could not.
const PAGE_SIZE = 25;
const HOSTNAME = "codingame.com";
// The search answers 202 with this code while the guild is being indexed.
const INDEX_NOT_READY = 110000;
const MAX_INDEX_WAITS = 10;
const MIN_INDEX_WAIT_MS = 2_000;
const MAX_INDEX_WAIT_MS = 30_000;

interface SearchMessage {
  id: string;
  channel_id: string;
  content?: string;
  author?: { bot?: boolean };
}

interface SearchResponse {
  // One message per inner array: the context around it is no longer sent.
  messages?: SearchMessage[][];
  code?: number;
  retry_after?: number;
}

export interface LinkedClash {
  handle: string;
  channelId: string;
  messageId: string;
}

export class SearchNotReadyError extends Error {
  constructor() {
    super("Discord is still indexing the guild for search");
  }
}

async function searchPage(
  rest: REST,
  guildId: string,
  channelId: string,
  after: string | undefined
): Promise<SearchMessage[]> {
  const query = new URLSearchParams({
    channel_id: channelId,
    link_hostname: HOSTNAME,
    sort_by: "timestamp",
    sort_order: "asc",
    limit: String(PAGE_SIZE),
    ...(after && { min_id: after }),
  });
  for (let wait = 0; ; wait++) {
    const body = (await rest.get(`/guilds/${guildId}/messages/search`, {
      query,
    })) as SearchResponse;
    if (body.code !== INDEX_NOT_READY) {
      return (body.messages ?? []).flat();
    }
    if (wait >= MAX_INDEX_WAITS) {
      throw new SearchNotReadyError();
    }
    const retryAfterMs = (body.retry_after ?? 0) * 1000;
    await sleep(
      Math.min(Math.max(retryAfterMs, MIN_INDEX_WAIT_MS), MAX_INDEX_WAIT_MS)
    );
  }
}

/**
 * Every clash linked in a channel, oldest first, each with the first message
 * that posted it. Links posted by bots are skipped, as the listener does.
 */
export async function findChannelClashes(
  rest: REST,
  guildId: string,
  channelId: string
): Promise<LinkedClash[]> {
  const found = new Map<string, LinkedClash>();
  let after: string | undefined;
  for (;;) {
    const messages = await searchPage(rest, guildId, channelId, after);
    const last = messages.at(-1);
    if (!last || last.id === after) {
      break;
    }
    for (const message of messages) {
      if (message.author?.bot) {
        continue;
      }
      for (const handle of parseClashLinks(message.content ?? "")) {
        if (!found.has(handle)) {
          found.set(handle, {
            handle,
            channelId: message.channel_id,
            messageId: message.id,
          });
        }
      }
    }
    after = last.id;
  }
  return [...found.values()];
}
