import { declareService, type Service } from "#lib/service.js";
import { analyseGame } from "../analysis/analyse.js";
import type { GameAnalysis, ParsedGame } from "../types.js";

/**
 * Each analysis is a Stockfish process using a whole core for up to three
 * minutes: the instance runs a couple at once and queues the others, and a
 * member waits for their own analysis before starting another one.
 */
const MAX_ENGINES = 2;
/**
 * Analyses waiting for an engine. Two engines at up to three minutes each
 * keep the last of them under ten minutes: past that, the interaction that
 * asked could expire before the result.
 */
const MAX_WAITING = 4;

/** A member asked for a second analysis while their first one still runs. */
export class AnalysisBusyError extends Error {
  constructor() {
    super("An analysis of this member is already running");
    this.name = "AnalysisBusyError";
  }
}

/** Every engine is busy and the queue is full: try again later. */
export class AnalysisQueueFullError extends Error {
  constructor() {
    super("Too many analyses are waiting for an engine");
    this.name = "AnalysisQueueFullError";
  }
}

/** Stockfish processes: a few at once, the others waiting their turn. */
class AnalysisEngines implements Service {
  private readonly busyOwners = new Set<string>();
  private readonly waiting: Array<() => void> = [];
  private running = 0;

  /**
   * Starts at once when an engine is free, after the queue otherwise. Throws
   * before starting when the member already waits for an analysis, or when
   * the queue is full.
   */
  analyse(ownerId: string, parsed: ParsedGame): Promise<GameAnalysis> {
    if (this.busyOwners.has(ownerId)) throw new AnalysisBusyError();
    if (this.running >= MAX_ENGINES && this.waiting.length >= MAX_WAITING) {
      throw new AnalysisQueueFullError();
    }
    this.busyOwners.add(ownerId);

    const run = async () => {
      try {
        return await analyseGame(parsed);
      } finally {
        this.releaseEngine();
      }
    };
    let started: Promise<GameAnalysis>;
    if (this.running < MAX_ENGINES) {
      this.running++;
      started = run();
    } else {
      started = new Promise<void>((resolve) => this.waiting.push(resolve)).then(
        run
      );
    }
    return started.finally(() => this.busyOwners.delete(ownerId));
  }

  private releaseEngine(): void {
    // Hand the engine over to the next analysis, keeping `running` as it is.
    const next = this.waiting.shift();
    if (next) next();
    else this.running--;
  }
}

export default declareService(new AnalysisEngines());
