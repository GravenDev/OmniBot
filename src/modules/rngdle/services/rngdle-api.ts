import {
  compressScoreTable,
  extractScoreTable,
  isPlausibleTable,
} from "./score-table.js";
import type { CompressedTable } from "./score-table.js";

const SITE_URL = "https://www.rngdle.com";
const REQUEST_TIMEOUT_MS = 30_000;
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

interface RollsPage {
  rolls: {
    id: string;
    number: number;
    totalScore: number;
    badgeCount?: number;
    rolledAt: string;
  }[];
  hasMore: boolean;
}

export class RngdleUserNotFoundError extends Error {
  constructor(readonly username: string) {
    super(`RNGdle user not found: ${username}`);
  }
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json, text/html, */*" },
  });
  return response;
}

export async function fetchUserRolls(
  username: string,
  since: Date | null
): Promise<RemoteRoll[]> {
  const rolls: RemoteRoll[] = [];
  let offset = 0;
  let limit = FIRST_PAGE_SIZE;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${SITE_URL}/api/users/${encodeURIComponent(username)}/rolls?limit=${limit}&offset=${offset}`;
    const response = await get(url);
    if (response.status === 404) {
      throw new RngdleUserNotFoundError(username);
    }
    if (!response.ok) {
      throw new Error(
        `RNGdle API responded ${response.status} for ${username}`
      );
    }

    const body = (await response.json()) as RollsPage;
    for (const roll of body.rolls) {
      rolls.push({
        id: roll.id,
        number: roll.number,
        score: roll.totalScore,
        badgeCount: roll.badgeCount ?? 0,
        rolledAt: new Date(roll.rolledAt),
      });
    }

    const oldest = rolls.at(-1);
    const reachedKnownRolls =
      since !== null && oldest !== undefined && oldest.rolledAt <= since;
    if (!body.hasMore || body.rolls.length === 0 || reachedKnownRolls) {
      break;
    }
    offset += body.rolls.length;
    limit = PAGE_SIZE;
  }

  return rolls;
}

export async function fetchScoreTableFromSite(): Promise<CompressedTable | null> {
  const home = await get(SITE_URL);
  if (!home.ok) {
    throw new Error(`rngdle.com responded ${home.status}`);
  }
  const html = await home.text();
  const scripts = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g),
  ].map((match) => new URL(match[1]!, SITE_URL).href);

  let best: Map<number, number> | null = null;
  for (const script of scripts) {
    const response = await get(script);
    if (!response.ok) {
      continue;
    }
    const table = extractScoreTable(await response.text());
    if (table && (!best || table.size > best.size)) {
      best = table;
    }
  }

  if (!best) {
    return null;
  }
  const compressed = compressScoreTable(best);
  return isPlausibleTable(compressed) ? compressed : null;
}
