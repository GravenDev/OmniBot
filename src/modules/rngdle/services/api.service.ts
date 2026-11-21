import { setTimeout as sleep } from "node:timers/promises";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import {
  parseRollsPage,
  RngdleApiError,
  type RemoteRoll,
} from "#modules/rngdle/parsing/remote-rolls.js";
import {
  compressScoreTable,
  extractScoreTable,
  isPlausibleTable,
  type CompressedTable,
} from "#modules/rngdle/scoring/score-table.js";

const logger = loggerMaker("rngdle");

const SITE_URL = "https://www.rngdle.com";
const USER_AGENT = "OmniBot (+https://github.com/GravenDev/OmniBot)";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const FIRST_PAGE_SIZE = 10;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

// The API's errors, both importable from here.
export { RngdleApiError };

export class RngdleUserNotFoundError extends Error {
  constructor(readonly username: string) {
    super(`RNGdle user not found: ${username}`);
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  const delay =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * 2 ** (attempt - 1);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

async function request(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS) {
      return response;
    }
    const delayMs = retryDelayMs(response, attempt);
    logger.debug(
      `RNGdle request retried | status = ${response.status} | attempt = ${attempt} | delayMs = ${delayMs}`
    );
    await sleep(delayMs);
  }
}

class RngdleApi implements Service {
  async fetchUserRolls(
    username: string,
    since: Date | null
  ): Promise<RemoteRoll[]> {
    const rolls: RemoteRoll[] = [];
    let limit = FIRST_PAGE_SIZE;

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await request(
        `${SITE_URL}/api/users/${encodeURIComponent(username)}/rolls?limit=${limit}&offset=${rolls.length}`
      );
      if (response.status === 404) {
        throw new RngdleUserNotFoundError(username);
      }
      if (!response.ok) {
        logger.debug(
          `RNGdle API request failed | status = ${response.status} | page = ${page}`
        );
        throw new RngdleApiError(`RNGdle API responded ${response.status}`);
      }

      const { rolls: pageRolls, hasMore } = parseRollsPage(
        await response.json()
      );
      rolls.push(...pageRolls);

      const oldest = pageRolls.at(-1);
      if (!hasMore || !oldest || (since && oldest.rolledAt <= since)) {
        break;
      }
      limit = PAGE_SIZE;
    }

    return rolls;
  }

  async fetchScoreTable(): Promise<CompressedTable | null> {
    const home = await request(SITE_URL);
    if (!home.ok) {
      logger.debug(`rngdle.com home page failed | status = ${home.status}`);
      throw new RngdleApiError(`rngdle.com responded ${home.status}`);
    }
    const scripts = [
      ...(await home.text()).matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g),
    ].map((match) => new URL(match[1]!, SITE_URL).href);

    let best: Map<number, number> | null = null;
    for (const script of scripts) {
      const response = await request(script);
      const table = response.ok
        ? extractScoreTable(await response.text())
        : null;
      if (table && (!best || table.size > best.size)) {
        best = table;
      }
    }

    const compressed = best && compressScoreTable(best);
    return compressed && isPlausibleTable(compressed) ? compressed : null;
  }
}

export default declareService(new RngdleApi());
