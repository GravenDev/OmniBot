import { describe, expect, it, vi } from "vitest";
import { parseGame } from "../games/pgn.js";
import store from "../services/session.service.js";
import type { GameAnalysis, GameSummary } from "../types.js";
import { analyseGame } from "./analyse.js";
import { runAnalysis } from "./run.js";

vi.mock("./analyse.js", () => ({ analyseGame: vi.fn() }));

const game: GameSummary = {
  id: "g1",
  source: "pgn",
  white: "Alice",
  black: "Bob",
  result: "unknown",
  timeControl: "600+0",
  speed: "rapide",
  playedAt: null,
  url: null,
  pgn: "1. e4 e5 *",
};

const analysis: GameAnalysis = {
  accuracies: { white: 90, black: 80 },
  ratings: ["best", "best"],
  evaluations: [
    { type: "cp", value: 0 },
    { type: "cp", value: 0 },
  ],
  counts: {
    white: [{ rating: "best", count: 1 }],
    black: [{ rating: "best", count: 1 }],
  },
};

describe("runAnalysis", () => {
  it("shares one engine run between simultaneous callers", async () => {
    let finish!: (value: GameAnalysis) => void;
    vi.mocked(analyseGame).mockReturnValue(
      new Promise<GameAnalysis>((resolve) => {
        finish = resolve;
      })
    );

    const session = store.create("owner", "analyse", "white", [game]);
    const parsed = parseGame(game.pgn)!;
    store.setParsed(session.id, parsed);

    const first = runAnalysis(session);
    const second = runAnalysis(session);
    expect(vi.mocked(analyseGame)).toHaveBeenCalledTimes(1);

    finish(analysis);
    await expect(Promise.all([first, second])).resolves.toEqual([
      analysis,
      analysis,
    ]);
    expect(store.get(session.id)?.analysis).toEqual(analysis);
    expect(session.pendingAnalysis).toBeUndefined();
  });

  it("ignores an analysis that finishes after another game was selected", async () => {
    const resolvers: Array<(value: GameAnalysis) => void> = [];
    vi.mocked(analyseGame).mockImplementation(
      () =>
        new Promise<GameAnalysis>((resolve) => {
          resolvers.push(resolve);
        })
    );

    const session = store.create("owner", "analyse", "white", [game]);
    store.setParsed(session.id, parseGame("1. e4 e5 *")!);
    const first = runAnalysis(session);
    store.setParsed(session.id, parseGame("1. d4 d5 *")!);
    const second = runAnalysis(session);

    resolvers[0]!(analysis);
    await first;
    expect(store.get(session.id)?.analysis).toBeUndefined();

    resolvers[1]!(analysis);
    await second;
    expect(store.get(session.id)?.analysis).toEqual(analysis);
  });

  it("reuses a completed analysis", async () => {
    vi.mocked(analyseGame).mockReset();
    vi.mocked(analyseGame).mockResolvedValue(analysis);
    const session = store.create("owner", "report", "white", [game]);
    const parsed = parseGame(game.pgn)!;
    store.setParsed(session.id, parsed);
    await runAnalysis(session);
    await runAnalysis(session);
    expect(vi.mocked(analyseGame)).toHaveBeenCalledTimes(1);
  });
});
