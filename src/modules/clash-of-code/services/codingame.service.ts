import { fetchWithRetry, retryAfterMs } from "#lib/http.js";
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
const REQUEST_TIMEOUT_MS = 30_000;

function request(handle: string): Promise<Response> {
  return fetchWithRetry(
    REPORT_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify([handle]),
    },
    {
      timeoutMs: REQUEST_TIMEOUT_MS,
      onRetry: (status, attempt, delayMs) =>
        logger.debug(
          `CodinGame request retried | status = ${status} | attempt = ${attempt} | delayMs = ${delayMs} | handle = ${handle}`
        ),
    }
  );
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
