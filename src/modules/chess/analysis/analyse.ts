import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { Chess } from "chessops";
import {
  classify,
  type Classification,
  type ClassifyOptions,
} from "wintrchess/classify";
import {
  Engine,
  type EngineEvents,
  type EngineLine,
  type Evaluation,
  getTopLine,
  getWinPercentLoss,
} from "wintrchess/engine";
import { RATING_ORDER } from "../ratings.js";
import type {
  ChessSide,
  GameAnalysis,
  ParsedGame,
  RatingCount,
} from "../types.js";
import { mean, moveAccuracy } from "./accuracy.js";

const ANALYSIS_TIMEOUT_MS = 180_000;
const SEARCH_DEPTH = 12;
const LINE_COUNT = 3;
const NEUTRAL: Evaluation = { type: "cp", value: 0 };

/** The mover is the side to move in the position before their move. */
function sideToMove(position: Chess | undefined): ChessSide {
  const turn = String(position?.turn);
  return turn === "w" || turn === "white" ? "white" : "black";
}

/** Engine adapter for the WASM Stockfish process spawned by Node. */
class NodeEngine extends Engine {
  private readonly messages = new Set<EngineEvents["message"]>();
  private readonly errors = new Set<EngineEvents["error"]>();
  private partialLine = "";
  private terminated = false;

  constructor(private readonly child: ChildProcess) {
    super();
    this.child.stdout?.on("data", (chunk: Buffer | string) => {
      const lines = (this.partialLine + chunk.toString()).split("\n");
      this.partialLine = lines.pop() ?? "";
      for (const line of lines) {
        const message = line.endsWith("\r") ? line.slice(0, -1) : line;
        for (const listener of this.messages) {
          // One malformed engine line must not crash the bot: dispatching
          // the failure to the error listeners rejects the analysis instead.
          try {
            listener(message);
          } catch (error) {
            this.fail(`Stockfish output error: ${String(error)}`);
          }
        }
      }
    });
    this.child.stderr?.on("data", (chunk: Buffer | string) => {
      this.fail(chunk.toString().trim());
    });
    // An engine that dies while an `evaluate` is waiting would otherwise
    // hang until the whole-game deadline.
    this.child.on("close", (code) => {
      if (!this.terminated) this.fail(`Stockfish exited with code ${code}`);
    });
    this.child.on("error", (error) => this.fail(error.message));
  }

  /** wintrchess rejects with whatever it is given: always hand it an Error. */
  private fail(reason: string): void {
    for (const listener of this.errors) listener(reason);
  }

  override sendCommand(command: string): void {
    this.child.stdin?.write(`${command}\n`);
  }

  override on<EventType extends keyof EngineEvents>(
    event: EventType,
    fn: EngineEvents[EventType]
  ): void {
    if (event === "message") this.messages.add(fn as EngineEvents["message"]);
    else this.errors.add(fn as EngineEvents["error"]);
  }

  override off<EventType extends keyof EngineEvents>(
    event: EventType,
    fn: EngineEvents[EventType]
  ): void {
    if (event === "message")
      this.messages.delete(fn as EngineEvents["message"]);
    else this.errors.delete(fn as EngineEvents["error"]);
  }

  override terminate(): void {
    this.terminated = true;
    if (!this.child.killed) this.child.kill();
  }
}

function createEngine(): Engine {
  const stockfish = createRequire(import.meta.url)("stockfish") as {
    findEngine(variant: string): string;
  };
  const enginePath = stockfish.findEngine("lite-single");
  const child = spawn(process.execPath, [enginePath], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new NodeEngine(child);
}

async function evaluatePositions(
  engine: Engine,
  game: ParsedGame
): Promise<EngineLine[][]> {
  await engine.uciMode();
  engine.setLineCount(LINE_COUNT);

  const lines: EngineLine[][] = [];
  for (const position of game.positions) {
    // One engine process is shared by every position: evaluations must run in sequence.
    engine.setPosition(position);
    lines.push(await engine.evaluate({ depth: SEARCH_DEPTH }));
  }
  return lines;
}

function ratingCounts(counts: Map<Classification, number>): RatingCount[] {
  return RATING_ORDER.flatMap((rating) => {
    const count = counts.get(rating);
    return count === undefined || count === 0 ? [] : [{ rating, count }];
  });
}

/**
 * Turns engine lines (one set per position, including the final one) into
 * classifications, accuracies and counts. Kept pure so it can be tested
 * without spawning Stockfish.
 */
export function buildAnalysis(
  lines: EngineLine[][],
  game: ParsedGame
): GameAnalysis {
  const ratings: Classification[] = [];
  const counts: Record<ChessSide, Map<Classification, number>> = {
    white: new Map(),
    black: new Map(),
  };
  const accuracies: Record<ChessSide, number[]> = { white: [], black: [] };
  // getTopLine picks the deepest line of each MultiPV index, like classify.
  // Keep one evaluation per position so the analysis tab can draw its gauge.
  const evaluations = game.positions.map(
    (_, i) => getTopLine(lines[i] ?? [])?.evaluation ?? NEUTRAL
  );

  for (const [i, step] of game.steps.entries()) {
    const side = sideToMove(game.positions[i]);

    let rating: Classification = "best";
    // The opponent's previous win% loss is what makes a "miss" detectable.
    // Without both surrounding lines, leave it undefined: classify still works.
    let lastWinPercentLoss: number | undefined;
    if (i > 0 && lines[i - 1]?.length && lines[i]?.length) {
      lastWinPercentLoss = getWinPercentLoss(
        evaluations[i - 1]!,
        evaluations[i]!,
        sideToMove(game.positions[i - 1])
      );
    }

    const options: ClassifyOptions = {
      position: game.positions[i]!,
      move: step.move,
      engineLines: {
        previous: lines[i] ?? [],
        current: lines[i + 1] ?? [],
      },
      ...(lastWinPercentLoss === undefined ? {} : { lastWinPercentLoss }),
    };
    try {
      rating = classify(options);
    } catch {
      // A missing or inconsistent engine line must not abort the whole game.
    }
    ratings.push(rating);
    counts[side].set(rating, (counts[side].get(rating) ?? 0) + 1);

    // Engine evaluations are White-relative: the accuracy formula handles the
    // mover's perspective itself, so converting them here would apply it twice.
    const accuracy = moveAccuracy(evaluations[i]!, evaluations[i + 1]!, side);
    // Keep WintrChess's unbounded result here; views clamp it for display.
    accuracies[side].push(accuracy);
  }

  return {
    accuracies: {
      white: mean(accuracies.white),
      black: mean(accuracies.black),
    },
    ratings,
    evaluations,
    counts: {
      white: ratingCounts(counts.white),
      black: ratingCounts(counts.black),
    },
  };
}

/** Analyses a whole game with a single Stockfish process. */
export async function analyseGame(game: ParsedGame): Promise<GameAnalysis> {
  const engine = createEngine();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Chess engine analysis timed out after 180s")),
      ANALYSIS_TIMEOUT_MS
    );
  });

  try {
    const lines = await Promise.race([
      evaluatePositions(engine, game),
      deadline,
    ]);
    return buildAnalysis(lines, game);
  } finally {
    clearTimeout(timer);
    engine.terminate();
  }
}
