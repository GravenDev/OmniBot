import { loggerMaker } from "#lib/logger.js";
import type { Health, Reporter } from "./heartbeat.js";

const logger = loggerMaker("monitoring");

const PUSH_TIMEOUT_MS = 10_000;

/**
 * The heartbeat URL: the one copied from Uptime Kuma already carries
 * `status`, `msg` and `ping` placeholders, which are replaced.
 */
export function heartbeatUrl(base: URL, health: Health): URL {
  const url = new URL(base);
  url.searchParams.set("status", health.up ? "up" : "down");
  url.searchParams.set("msg", health.msg);
  url.searchParams.set(
    "ping",
    health.ping === undefined ? "" : String(Math.round(health.ping))
  );
  return url;
}

/**
 * Reports each heartbeat to an Uptime Kuma push monitor. Returns null without
 * a push URL: the bot then runs without it.
 */
export function uptimeKumaReporter(
  base: URL | undefined,
  fetch: typeof globalThis.fetch = globalThis.fetch
): Reporter | null {
  if (!base) {
    return null;
  }
  logger.info("Uptime Kuma push monitoring enabled");
  // Logged on change only, so an unreachable Uptime Kuma does not repeat the
  // same line every 30 s.
  let failing = false;

  return async (health, signal) => {
    try {
      const response = await fetch(heartbeatUrl(base, health), {
        signal: AbortSignal.any([signal, AbortSignal.timeout(PUSH_TIMEOUT_MS)]),
      });
      // Unread, the body would hold its socket until garbage collection and
      // every heartbeat could open a new connection.
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(`Uptime Kuma answered HTTP ${response.status}`);
      }
      if (failing) {
        logger.info("Uptime Kuma heartbeat delivered again");
        failing = false;
      }
    } catch (err) {
      if (signal.aborted) {
        return;
      }
      if (!failing) {
        // Messages only, never the error object: it could quote the URL and
        // its token.
        logger.warn(
          `Uptime Kuma heartbeat not delivered | error = ${describe(err)}`
        );
        failing = true;
      }
    }
  };
}

// undici reports every network failure as "fetch failed", with the reason
// (DNS, refused connection, TLS) in its cause.
function describe(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  return err.cause instanceof Error
    ? `${err.message}: ${err.cause.message}`
    : err.message;
}
