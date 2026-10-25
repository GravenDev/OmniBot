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
// the game is tried again rather than counted as failed.
export const CONCURRENCY = 2;
export const REQUEST_SPACING_MS = 500;
export const RATE_LIMIT_PAUSE_MS = 60_000;
export const MAX_RATE_LIMIT_RETRIES = 5;

export interface ImportSummary {
  found: number;
  done: number;
  imported: number;
  known: number;
  unfinished: number;
  unknown: number;
  failed: number;
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
  pacer: Pacer
): Promise<Outcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (await store.isKnown(guildId, clash.handle)) {
        return "known";
      }
      await pacer.turn();
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
        logger.warn(
          `CodinGame rate limit, pausing the import | guildId = ${guildId} | pauseMs = ${pauseMs}`
        );
        pacer.pause(pauseMs);
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

/** Imports the finished games among `clashes`, without posting anything. */
export async function importClashes(
  guildId: string,
  clashes: LinkedClash[],
  onProgress: (summary: ImportSummary) => void = () => undefined
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    found: clashes.length,
    done: 0,
    imported: 0,
    known: 0,
    unfinished: 0,
    unknown: 0,
    failed: 0,
  };
  const pacer = new Pacer();
  let next = 0;
  const worker = async () => {
    while (next < clashes.length) {
      const clash = clashes[next++]!;
      summary[await importOne(guildId, clash, pacer)]++;
      summary.done++;
      onProgress({ ...summary });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}
