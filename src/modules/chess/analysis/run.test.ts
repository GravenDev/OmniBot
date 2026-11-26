import { describe, expect, it, vi } from "vitest";
import { parseGame } from "../games/pgn.js";
import {
  AnalysisBusyError,
  AnalysisQueueFullError,
} from "../services/engines.service.js";
import store from "../services/session.service.js";
import type { GameAnalysis, GameSummary } from "../types.js";
import { analyseGame } from "./analyse.js";
import { analysisErrorKey, runAnalysis } from "./run.js";

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

    resolvers[0]!(analysis);
    await first;
    expect(store.get(session.id)?.analysis).toBeUndefined();

    const second = runAnalysis(session);
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
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

describe("runAnalysis limits", () => {
  function pending() {
    const resolvers: Array<(value: GameAnalysis) => void> = [];
    vi.mocked(analyseGame).mockReset();
    vi.mocked(analyseGame).mockImplementation(
      () =>
        new Promise<GameAnalysis>((resolve) => {
          resolvers.push(resolve);
        })
    );
    return resolvers;
  }

  function sessionOf(owner: string) {
    const session = store.create(owner, "analyse", "white", [game]);
    store.setParsed(session.id, parseGame(game.pgn)!);
    return session;
  }

  it("refuses a member's second analysis while the first one runs", async () => {
    const resolvers = pending();
    const first = runAnalysis(sessionOf("busy-owner"));

    await expect(runAnalysis(sessionOf("busy-owner"))).rejects.toBeInstanceOf(
      AnalysisBusyError
    );

    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers[0]!(analysis);
    await first;
    // Once finished, the member may analyse another game.
    const next = runAnalysis(sessionOf("busy-owner"));
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]!(analysis);
    await expect(next).resolves.toEqual(analysis);
  });

  it("runs at most two engines at once and queues the others", async () => {
    const resolvers = pending();
    const runs = ["m1", "m2", "m3"].map((owner) =>
      runAnalysis(sessionOf(owner))
    );

    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    // The third member waits for a free engine instead of starting a third.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(vi.mocked(analyseGame)).toHaveBeenCalledTimes(2);

    resolvers[0]!(analysis);
    await vi.waitFor(() => expect(resolvers).toHaveLength(3));
    resolvers[1]!(analysis);
    resolvers[2]!(analysis);
    await expect(Promise.all(runs)).resolves.toHaveLength(3);
  });

  it("frees the engine and the member when an analysis fails", async () => {
    vi.mocked(analyseGame).mockReset();
    vi.mocked(analyseGame).mockRejectedValueOnce(new Error("engine died"));
    await expect(runAnalysis(sessionOf("failing-owner"))).rejects.toThrow(
      "engine died"
    );

    vi.mocked(analyseGame).mockResolvedValueOnce(analysis);
    await expect(runAnalysis(sessionOf("failing-owner"))).resolves.toEqual(
      analysis
    );
  });

  it("refuses a new analysis once four are already waiting", async () => {
    const resolvers = pending();
    const owners = ["q1", "q2", "q3", "q4", "q5", "q6"];
    const runs = owners.map((owner) => runAnalysis(sessionOf(owner)));
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));

    // Two engines busy, four members waiting: a seventh would wait so long
    // that its interaction expires before the result.
    const refused = runAnalysis(sessionOf("q7"));
    await expect(refused).rejects.toBeInstanceOf(AnalysisQueueFullError);
    expect(analysisErrorKey(await refused.catch((e: unknown) => e))).toBe(
      "error.queueFull"
    );

    for (let i = 0; i < owners.length; i++) {
      await vi.waitFor(() => expect(resolvers.length).toBeGreaterThan(i));
      resolvers[i]!(analysis);
    }
    await expect(Promise.all(runs)).resolves.toHaveLength(6);
    // The refused member may try again once the queue has room.
    vi.mocked(analyseGame).mockResolvedValueOnce(analysis);
    await expect(runAnalysis(sessionOf("q7"))).resolves.toEqual(analysis);
  });
});

describe("runAnalysis of a variant", () => {
  it("refuses it before starting an engine: Stockfish only knows standard chess", async () => {
    vi.mocked(analyseGame).mockReset();
    const atomic: GameSummary = {
      ...game,
      pgn: '[Variant "Atomic"]\n[Result "*"]\n\n1. e4 e5 *',
    };
    const session = store.create("variant-owner", "analyse", "white", [atomic]);
    store.setParsed(session.id, parseGame(atomic.pgn)!);

    const refused = runAnalysis(session);
    await expect(refused).rejects.toBeInstanceOf(Error);
    expect(analysisErrorKey(await refused.catch((e: unknown) => e))).toBe(
      "error.variant"
    );
    expect(vi.mocked(analyseGame)).not.toHaveBeenCalled();
  });
});
