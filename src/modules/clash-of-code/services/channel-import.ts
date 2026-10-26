import { setTimeout as sleep } from "node:timers/promises";
import { loggerMaker } from "#lib/logger.js";
import {
  ClashNotFoundError,
  ClashRateLimitedError,
  fetchClashReport,
} from "./api.js";
import type { LinkedClash } from "./history.js";
import store from "./store.js";

const logger = loggerMaker("clash-of-code");

// A channel can hold hundreds of links: CodinGame is asked gently, a couple of
// games at a time with a gap between requests. When it still answers 429 (the
// API client already retried), every worker pauses for as long as it asks, and
// the game is tried again rather than counted as failed. Past
// MAX_RATE_LIMIT_PAUSE_MS, the import stops instead: a server asking for that
// long would turn an earlier retry down anyway.
export const CONCURRENCY = 2;
export const REQUEST_SPACING_MS = 500;
export const RATE_LIMIT_PAUSE_MS = 60_000;
export const MAX_RATE_LIMIT_PAUSE_MS = 5 * 60_000;
export const MAX_RATE_LIMIT_RETRIES = 5;

/** Why an import stopped before checking every game. */
export type StopReason = "time" | "rateLimit";

export interface ImportSummary {
  found: number;
  done: number;
  imported: number;
  known: number;
  unfinished: number;
  unknown: number;
  failed: number;
  stopped: StopReason | null;
  /** While CodinGame makes the import wait: when it resumes (epoch ms). */
  pausedUntil: number | null;
}

export interface ImportOptions {
  /** No game is started, nor waited for, past this time (epoch ms). */
  deadline?: number;
  onProgress?: (summary: ImportSummary) => void;
  /**
   * Gets the handle of every game checked, whatever its outcome: a later run
   * can leave them out and go on with the others.
   */
  checked?: Set<string>;
}

type Outcome = "imported" | "known" | "unfinished" | "unknown" | "failed";

class Pacer {
  private nextAt = 0;

  async turn(): Promise<void> {
    for (;;) {
      const wait = this.nextAt - Date.now();
      if (wait <= 0) {
        this.nextAt = Date.now() + REQUEST_SPACING_MS;
        return;
      }
      await sleep(wait);
    }
  }

  pause(ms: number): void {
    this.nextAt = Math.max(this.nextAt, Date.now() + ms);
  }
}

async function importOne(
  guildId: string,
  clash: LinkedClash,
  pacer: Pacer,
  deadline: number,
  onPause: (until: number) => void
): Promise<Outcome | StopReason> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (await store.isKnown(guildId, clash.handle)) {
        return "known";
      }
      await pacer.turn();
      // The turn may come after the deadline, behind the other worker's.
      if (Date.now() >= deadline) {
        return "time";
      }
      const report = await fetchClashReport(clash.handle);
      if (!report.finished || !report.started) {
        return "unfinished";
      }
      const imported = await store.importReport(guildId, report, {
        channelId: clash.channelId,
        messageId: clash.messageId,
      });
      return imported ? "imported" : "known";
    } catch (err) {
      if (err instanceof ClashNotFoundError) {
        return "unknown";
      }
      if (
        err instanceof ClashRateLimitedError &&
        attempt < MAX_RATE_LIMIT_RETRIES
      ) {
        const pauseMs = err.retryAfterMs ?? RATE_LIMIT_PAUSE_MS;
        if (pauseMs > MAX_RATE_LIMIT_PAUSE_MS) {
          logger.warn(
            `CodinGame asks to wait too long, stopping the import | guildId = ${guildId} | pauseMs = ${pauseMs}`
          );
          return "rateLimit";
        }
        if (Date.now() + pauseMs >= deadline) {
          return "time";
        }
        logger.warn(
          `CodinGame rate limit, pausing the import | guildId = ${guildId} | pauseMs = ${pauseMs}`
        );
        pacer.pause(pauseMs);
        onPause(Date.now() + pauseMs);
        continue;
      }
      logger.warn(
        { err },
        `Could not import a clash | guildId = ${guildId} | handle = ${clash.handle}`
      );
      return "failed";
    }
  }
}

/**
 * Imports the finished games among `clashes`, without posting anything. It
 * can stop early (`stopped`): the games it checked are in `checked`.
 */
export async function importClashes(
  guildId: string,
  clashes: LinkedClash[],
  {
    deadline = Number.POSITIVE_INFINITY,
    onProgress = () => undefined,
    checked,
  }: ImportOptions = {}
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    found: clashes.length,
    done: 0,
    imported: 0,
    known: 0,
    unfinished: 0,
    unknown: 0,
    failed: 0,
    stopped: null,
    pausedUntil: null,
  };
  const onPause = (until: number) => {
    summary.pausedUntil = until;
    onProgress({ ...summary });
  };
  const pacer = new Pacer();
  let next = 0;
  const worker = async () => {
    while (next < clashes.length && !summary.stopped) {
      if (Date.now() >= deadline) {
        summary.stopped = "time";
        break;
      }
      const clash = clashes[next++]!;
      const outcome = await importOne(guildId, clash, pacer, deadline, onPause);
      summary.pausedUntil = null;
      if (outcome === "time" || outcome === "rateLimit") {
        summary.stopped ??= outcome;
        break;
      }
      summary[outcome]++;
      summary.done++;
      checked?.add(clash.handle);
      onProgress({ ...summary });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}
