import { setTimeout as sleep } from "node:timers/promises";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import {
  ClashApiError,
  ClashNotFoundError,
  ClashRateLimitedError,
  parseReport,
  type ClashReport,
} from "#modules/clash-of-code/api.js";

const logger = loggerMaker("clash-of-code");

const REPORT_URL =
  "https://www.codingame.com/services/ClashOfCode/findClashReportInfoByHandle";
const USER_AGENT = "OmniBot (+https://github.com/GravenDev/OmniBot)";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

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
    const delayMs = retryDelayMs(response, attempt);
    logger.debug(
      `CodinGame request retried | status = ${response.status} | attempt = ${attempt} | delayMs = ${delayMs} | handle = ${handle}`
    );
    await sleep(delayMs);
  }
}

class CodinGameService implements Service {
  async fetchClashReport(handle: string): Promise<ClashReport> {
    const response = await request(handle);
    if (response.status === 422 || response.status === 404) {
      throw new ClashNotFoundError(handle);
    }
    if (response.status === 429) {
      logger.debug(
        `CodinGame rate limit persists, giving up | status = ${response.status} | handle = ${handle}`
      );
      throw new ClashRateLimitedError(handle, retryAfterMs(response));
    }
    if (!response.ok) {
      logger.debug(
        `CodinGame request failed | status = ${response.status} | handle = ${handle}`
      );
      throw new ClashApiError(
        `CodinGame responded ${response.status} for clash ${handle}`
      );
    }
    return parseReport(await response.json());
  }
}

export default declareService(new CodinGameService());
