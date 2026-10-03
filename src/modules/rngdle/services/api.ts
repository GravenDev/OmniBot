import { setTimeout as sleep } from "node:timers/promises";
import {
  compressScoreTable,
  extractScoreTable,
  isPlausibleTable,
  type CompressedTable,
} from "./scoring.js";

const SITE_URL = "https://www.rngdle.com";
const USER_AGENT = "OmniBot (+https://github.com/GravenDev/OmniBot)";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const FIRST_PAGE_SIZE = 10;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export interface RemoteRoll {
  id: string;
  number: number;
  score: number;
  badgeCount: number;
  rolledAt: Date;
}

export class RngdleUserNotFoundError extends Error {
  constructor(readonly username: string) {
    super(`RNGdle user not found: ${username}`);
  }
}

export class RngdleApiError extends Error {}

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
    await sleep(retryDelayMs(response, attempt));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRoll(value: unknown): RemoteRoll {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    !Number.isSafeInteger(value["number"]) ||
    !Number.isSafeInteger(value["totalScore"]) ||
    typeof value["rolledAt"] !== "string"
  ) {
    throw new RngdleApiError("Unexpected roll in the RNGdle API response");
  }
  const rolledAt = new Date(value["rolledAt"]);
  if (Number.isNaN(rolledAt.getTime())) {
    throw new RngdleApiError("Invalid roll date in the RNGdle API response");
  }
  const badgeCount = value["badgeCount"];
  return {
    id: value["id"],
    number: value["number"] as number,
    score: value["totalScore"] as number,
    badgeCount: Number.isSafeInteger(badgeCount) ? (badgeCount as number) : 0,
    rolledAt,
  };
}

function parseRollsPage(body: unknown): {
  rolls: RemoteRoll[];
  hasMore: boolean;
} {
  if (!isRecord(body) || !Array.isArray(body["rolls"])) {
    throw new RngdleApiError("Unexpected RNGdle API response");
  }
  return {
    rolls: body["rolls"].map(parseRoll),
    hasMore: body["hasMore"] === true,
  };
}

export async function fetchUserRolls(
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
      throw new RngdleApiError(
        `RNGdle API responded ${response.status} for ${username}`
      );
    }

    const { rolls: pageRolls, hasMore } = parseRollsPage(await response.json());
    rolls.push(...pageRolls);

    const oldest = pageRolls.at(-1);
    if (!hasMore || !oldest || (since && oldest.rolledAt <= since)) {
      break;
    }
    limit = PAGE_SIZE;
  }

  return rolls;
}

export async function fetchScoreTable(): Promise<CompressedTable | null> {
  const home = await request(SITE_URL);
  if (!home.ok) {
    throw new RngdleApiError(`rngdle.com responded ${home.status}`);
  }
  const scripts = [
    ...(await home.text()).matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g),
  ].map((match) => new URL(match[1]!, SITE_URL).href);

  let best: Map<number, number> | null = null;
  for (const script of scripts) {
    const response = await request(script);
    const table = response.ok ? extractScoreTable(await response.text()) : null;
    if (table && (!best || table.size > best.size)) {
      best = table;
    }
  }

  const compressed = best && compressScoreTable(best);
  return compressed && isPlausibleTable(compressed) ? compressed : null;
}
