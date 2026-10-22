import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("rngdle");

const BADGES_URL = "https://rng.cubityfir.st/api";
const USER_AGENT = "OmniBot (+https://github.com/GravenDev/OmniBot)";
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_SIZE = 500;

export interface RollBadge {
  id: string;
  label: string;
  emoji: string;
  ep: number;
  rarity: string;
  probability: number;
}

export interface RollBadges {
  number: number;
  score: number;
  badges: RollBadge[];
}

const cache = new Map<number, RollBadges>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBadge(value: unknown): RollBadge | null {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    typeof value["label"] !== "string" ||
    typeof value["emoji"] !== "string" ||
    typeof value["ep"] !== "number" ||
    typeof value["rarity"] !== "string"
  ) {
    return null;
  }
  return {
    id: value["id"],
    label: value["label"],
    emoji: value["emoji"],
    ep: value["ep"],
    rarity: value["rarity"],
    probability: typeof value["prob"] === "number" ? value["prob"] : NaN,
  };
}

export function parseRollBadges(
  number: number,
  body: unknown
): RollBadges | null {
  if (
    !isRecord(body) ||
    body["number"] !== number ||
    typeof body["totalEP"] !== "number" ||
    !Array.isArray(body["badges"])
  ) {
    return null;
  }
  const badges = body["badges"].map(parseBadge);
  if (badges.some((badge) => badge === null)) {
    return null;
  }
  return {
    number,
    score: body["totalEP"],
    badges: badges as RollBadge[],
  };
}

export async function fetchRollBadges(
  number: number
): Promise<RollBadges | null> {
  const cached = cache.get(number);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(`${BADGES_URL}?n=${number}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const badges = parseRollBadges(number, await response.json());
    if (!badges) {
      throw new Error("Unexpected response");
    }
    cache.set(number, badges);
    if (cache.size > CACHE_SIZE) {
      cache.delete(cache.keys().next().value!);
    }
    return badges;
  } catch (err) {
    logger.warn({ err }, `Could not fetch the badges | number = ${number}`);
    return null;
  }
}
