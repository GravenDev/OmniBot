import { setTimeout as sleep } from "node:timers/promises";
import {
  RESTJSONErrorCodes,
  Routes,
  type APIMessage,
  type REST,
  type RESTGetAPIGuildMessagesSearchResult,
} from "discord.js";
import { isApiError } from "#lib/discord-errors.js";

// POLYFILL — delete this file once discord.js ships `Guild#searchMessages`
// (discordjs/discord.js#11459): `guild-message-search.test.ts` fails on the
// discord.js update that brings it, and its callers move to that method.
//
// Discord's guild message search, opened to bots in 2025: discord.js has its
// route but no method yet, so it is called through `client.rest` until then.
// It reads the channels the bot can see, is open only to applications granted
// Message Content in the Developer Portal (no gateway intent is involved),
// and answers 202 with a code (110000) while the guild is being indexed.
const INDEX_NOT_READY = 110000;
const MAX_INDEX_WAITS = 10;
const MIN_INDEX_WAIT_MS = 2_000;
const MAX_INDEX_WAIT_MS = 30_000;

export type SearchMessage = Omit<APIMessage, "reactions">;

export interface SearchPage {
  messages: SearchMessage[];
  /**
   * Discord is still indexing the guild's old history: older messages may be
   * missing from the page.
   */
  deepIndexing: boolean;
}

/**
 * Whether Discord refused the search: no Message Content access for the
 * application, or no channel the bot may read. Retrying cannot help.
 */
export function isSearchDenied(err: unknown): boolean {
  return isApiError(
    err,
    RESTJSONErrorCodes.MissingAccess,
    RESTJSONErrorCodes.MissingPermissions
  );
}

export class SearchNotReadyError extends Error {
  constructor() {
    super("Discord is still indexing the guild for search");
  }
}

/**
 * One page of results for `query`, waiting while Discord indexes the guild;
 * null when `deadline` (epoch ms) comes before the index does. The deadline
 * only bounds those waits: discord.js's rate limit waits ignore an abort
 * signal, and its own aborts are not told apart from a network timeout.
 * Throws `SearchNotReadyError` when the index never becomes available.
 */
export async function searchGuildMessagesPage(
  rest: REST,
  guildId: string,
  query: URLSearchParams,
  deadline = Number.POSITIVE_INFINITY
): Promise<SearchPage | null> {
  for (let wait = 0; ; wait++) {
    const body = (await rest.get(Routes.guildMessagesSearch(guildId), {
      query,
    })) as RESTGetAPIGuildMessagesSearchResult;
    if (!("code" in body) || body.code !== INDEX_NOT_READY) {
      const page = body as Exclude<typeof body, { code: number }>;
      return {
        messages: (page.messages ?? []).flat(),
        deepIndexing: page.doing_deep_historical_index === true,
      };
    }
    if (wait >= MAX_INDEX_WAITS) {
      throw new SearchNotReadyError();
    }
    const retryAfterMs = (body.retry_after ?? 0) * 1000;
    const waitMs = Math.min(
      Math.max(retryAfterMs, MIN_INDEX_WAIT_MS),
      MAX_INDEX_WAIT_MS
    );
    if (Date.now() + waitMs >= deadline) {
      return null;
    }
    await sleep(waitMs);
  }
}

/** The messages of `searchGuildMessagesPage`, or null past the deadline. */
export async function searchGuildMessages(
  rest: REST,
  guildId: string,
  query: URLSearchParams,
  deadline = Number.POSITIVE_INFINITY
): Promise<SearchMessage[] | null> {
  const page = await searchGuildMessagesPage(rest, guildId, query, deadline);
  return page && page.messages;
}
