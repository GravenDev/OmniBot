import { retryAfterMs, USER_AGENT } from "#lib/http.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { declareService, type Service } from "#lib/service.js";

const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_PAUSE_MS = 60_000;

/** A site answered 429: no request goes to it before `retryAfterMs`. */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Rate limited for ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "RateLimitedError";
  }
}

/** lichess.org, chess.com: api.chess.com and www.chess.com share one limit. */
function siteOf(url: string): string {
  return new URL(url).hostname.split(".").slice(-2).join(".");
}

/**
 * One request at a time per site, as Lichess asks of API clients, and none
 * while a site's 429 pause runs: the watches and the lists of every guild
 * share the same IP, and so the same limit.
 */
class SiteRequests implements Service {
  private readonly queue = new KeyedQueue();
  private readonly pausedUntil = new Map<string, number>();

  text(url: string, headers: Record<string, string> = {}): Promise<string> {
    const site = siteOf(url);
    return this.queue.run(site, async () => {
      const pause = (this.pausedUntil.get(site) ?? 0) - Date.now();
      if (pause > 0) throw new RateLimitedError(pause);

      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, ...headers },
      });
      if (response.status === 429) {
        const wait = retryAfterMs(response) ?? RATE_LIMIT_PAUSE_MS;
        this.pausedUntil.set(site, Date.now() + wait);
        throw new RateLimitedError(wait);
      }
      if (!response.ok) {
        throw new Error(
          `Request to ${url} failed: ${response.status} ${response.statusText}`.trim()
        );
      }
      return response.text();
    });
  }

  async json(url: string): Promise<unknown> {
    return JSON.parse(
      await this.text(url, { Accept: "application/json" })
    ) as unknown;
  }
}

export default declareService(new SiteRequests());
