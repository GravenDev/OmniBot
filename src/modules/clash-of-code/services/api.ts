import { setTimeout as sleep } from "node:timers/promises";

const REPORT_URL =
  "https://www.codingame.com/services/ClashOfCode/findClashReportInfoByHandle";
const AVATAR_URL = "https://static.codingame.com/servlet/fileservlet";
const USER_AGENT = "OmniBot (+https://github.com/GravenDev/OmniBot)";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export type ClashMode = "FASTEST" | "SHORTEST" | "REVERSE";

export const CLASH_MODES: readonly ClashMode[] = [
  "FASTEST",
  "SHORTEST",
  "REVERSE",
];

export interface ClashPlayer {
  codingamerId: number;
  nickname: string;
  avatarId: bigint | null;
  rank: number;
  score: number;
  durationMs: number;
  criterion: number | null;
  language: string | null;
}

export interface ClashReport {
  handle: string;
  mode: ClashMode | null;
  startedAt: Date | null;
  started: boolean;
  finished: boolean;
  players: ClashPlayer[];
}

export class ClashNotFoundError extends Error {
  constructor(readonly handle: string) {
    super(`Clash not found: ${handle}`);
  }
}

export class ClashApiError extends Error {}

/** CodinGame still answered 429 after the retries; `retryAfterMs` is its ask. */
export class ClashRateLimitedError extends ClashApiError {
  constructor(
    readonly handle: string,
    readonly retryAfterMs: number | null
  ) {
    super(`CodinGame rate-limited clash ${handle}`);
  }
}

export function avatarUrl(avatarId: bigint): string {
  return `${AVATAR_URL}?id=${avatarId}&format=profile_avatar`;
}

export function isClashMode(value: unknown): value is ClashMode {
  return CLASH_MODES.includes(value as ClashMode);
}

// Retry-After is either a number of seconds or an HTTP date.
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return seconds > 0 ? seconds * 1000 : null;
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(date - Date.now(), 0) || null;
}

function retryDelayMs(response: Response, attempt: number): number {
  const delay = retryAfterMs(response) ?? 1000 * 2 ** (attempt - 1);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

async function request(handle: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(REPORT_URL, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify([handle]),
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

function optionalInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function parsePlayer(value: unknown): ClashPlayer {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value["codingamerId"]) ||
    typeof value["codingamerNickname"] !== "string" ||
    !Number.isSafeInteger(value["rank"])
  ) {
    throw new ClashApiError("Unexpected player in the CodinGame response");
  }
  const avatarId = optionalInteger(value["codingamerAvatarId"]);
  const language = value["languageId"];
  return {
    codingamerId: value["codingamerId"] as number,
    nickname: value["codingamerNickname"],
    avatarId: avatarId === null ? null : BigInt(avatarId),
    rank: value["rank"] as number,
    score: optionalInteger(value["score"]) ?? 0,
    durationMs: optionalInteger(value["duration"]) ?? 0,
    criterion: optionalInteger(value["criterion"]),
    language: typeof language === "string" ? language : null,
  };
}

export function parseReport(body: unknown): ClashReport {
  if (
    !isRecord(body) ||
    typeof body["publicHandle"] !== "string" ||
    typeof body["started"] !== "boolean" ||
    typeof body["finished"] !== "boolean" ||
    !Array.isArray(body["players"])
  ) {
    throw new ClashApiError("Unexpected CodinGame response");
  }
  const start = optionalInteger(body["startTimestamp"]);
  return {
    handle: body["publicHandle"],
    mode: isClashMode(body["mode"]) ? body["mode"] : null,
    startedAt: start === null ? null : new Date(start),
    started: body["started"],
    finished: body["finished"],
    players: body["players"].map(parsePlayer).sort((a, b) => a.rank - b.rank),
  };
}

export async function fetchClashReport(handle: string): Promise<ClashReport> {
  const response = await request(handle);
  if (response.status === 422 || response.status === 404) {
    throw new ClashNotFoundError(handle);
  }
  if (response.status === 429) {
    throw new ClashRateLimitedError(handle, retryAfterMs(response));
  }
  if (!response.ok) {
    throw new ClashApiError(
      `CodinGame responded ${response.status} for clash ${handle}`
    );
  }
  return parseReport(await response.json());
}
