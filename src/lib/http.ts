import { setTimeout as sleep } from "node:timers/promises";

/** Sent with every request to another site, so its owner can reach us. */
export const USER_AGENT = "OmniBot (+https://github.com/GravenDev/OmniBot)";

/** A rate limit or a server error: the same request may succeed later. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * How long a response asks to wait before the next request, in milliseconds:
 * `Retry-After` is either a number of seconds or an HTTP date. Null when the
 * header is missing, invalid or already past.
 */
export function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds > 0 ? seconds * 1000 : null;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(date - Date.now(), 0) || null;
}

export interface RetryOptions {
  /** Aborts each attempt after this long. */
  timeoutMs: number;
  /** Attempts in all, the first one included. */
  maxAttempts?: number;
  /** A longer `Retry-After` is cut down to this. */
  maxRetryDelayMs?: number;
  /** Called before each wait, to log it. */
  onRetry?: (status: number, attempt: number, delayMs: number) => void;
}

/**
 * `fetch` that retries a rate limit or a server error, waiting what
 * `Retry-After` says (1 s, 2 s, 4 s… without it). The last response is
 * returned whatever its status: the caller tells a 404 from a 429.
 */
export async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, "headers" | "signal"> & {
    headers?: Record<string, string>;
  },
  {
    timeoutMs,
    maxAttempts = 3,
    maxRetryDelayMs = 30_000,
    onRetry,
  }: RetryOptions
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": USER_AGENT, ...init.headers },
    });
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= maxAttempts) {
      return response;
    }
    const delayMs = Math.min(
      retryAfterMs(response) ?? 1000 * 2 ** (attempt - 1),
      maxRetryDelayMs
    );
    onRetry?.(response.status, attempt, delayMs);
    await sleep(delayMs);
  }
}
