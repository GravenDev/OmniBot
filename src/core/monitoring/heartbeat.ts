import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("monitoring");

export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Failing checks in a row before down is reported. A shard resuming for a
 * second, or the pool busy for a moment, must not page anyone: a pushed down
 * can be applied at once by Uptime Kuma, whatever its retries.
 */
const FAILURES_BEFORE_DOWN = 2;

/** The bot's health, as reported on each heartbeat. */
export interface Health {
  up: boolean;
  msg: string;
  /** Gateway latency in ms, when known. */
  ping?: number;
}

/**
 * Where a heartbeat goes. Expected to handle (and log) its own failures, and
 * to give up quietly once `signal` is aborted: the heartbeat is stopping.
 */
export type Reporter = (health: Health, signal: AbortSignal) => Promise<void>;

export interface HeartbeatOptions {
  check: () => Promise<Health>;
  reporters: Reporter[];
  intervalMs?: number;
}

/**
 * Checks the bot's health right away, then every 30 s, and hands the result to
 * each reporter, down only once confirmed by the next check. Returns a
 * function that stops it: a check in flight is abandoned and reports in flight
 * are aborted, so it resolves at once (shutdown must fit in Docker's 10 s stop
 * timeout) and nothing is reported after it.
 */
export function startHeartbeat(options: HeartbeatOptions): () => Promise<void> {
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const stopping = new AbortController();
  const stopped = new Promise<null>((resolve) =>
    stopping.signal.addEventListener("abort", () => resolve(null), {
      once: true,
    })
  );
  let timer: NodeJS.Timeout | undefined;
  // Logged on change only, so a long outage does not repeat the same line
  // every 30 s.
  let last: string | undefined;
  let failures = 0;

  const tick = async () => {
    let checkError: unknown;
    const health = await Promise.race([
      // Wrapped like the reporters below: a synchronous throw must not end
      // the loop either.
      (async () => options.check())().catch((err: unknown): Health => {
        checkError = err;
        return { up: false, msg: "Health check failed" };
      }),
      stopped,
    ]);
    if (!health || stopping.signal.aborted) {
      // Shutting down: a late "up" would rewrite what shutdown cleared.
      return;
    }
    failures = health.up ? 0 : failures + 1;
    if (failures > 0 && failures < FAILURES_BEFORE_DOWN) {
      // Unconfirmed: the reporters keep the previous state meanwhile.
      return;
    }
    const summary = health.up ? "up" : `down: ${health.msg}`;
    if (summary !== last) {
      if (health.up) {
        logger.info("Health reported as up");
      } else if (checkError !== undefined) {
        logger.error({ err: checkError }, "Health check failed");
      } else {
        logger.warn(`Health reported as down | reason = ${health.msg}`);
      }
      last = summary;
    }
    await Promise.all(
      options.reporters.map((report) =>
        // Wrapped, so that a reporter throwing synchronously cannot end the
        // loop: it would never schedule the next heartbeat.
        (async () => report(health, stopping.signal))().catch((err: unknown) =>
          logger.error({ err }, "Health reporter failed")
        )
      )
    );
  };

  // Chained timeouts rather than an interval: a slow check or report never
  // overlaps the next one.
  const loop = async () => {
    await tick();
    if (!stopping.signal.aborted) {
      timer = setTimeout(() => {
        running = loop();
      }, intervalMs);
      timer.unref();
    }
  };
  let running = loop();

  return async () => {
    stopping.abort();
    clearTimeout(timer);
    await running;
  };
}
