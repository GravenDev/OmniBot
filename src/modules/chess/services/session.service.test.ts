import { describe, expect, it } from "vitest";
import { parseGame } from "../games/pgn.js";
import type { GameAnalysis, GameSummary } from "../types.js";
import store from "./session.service.js";

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

describe("chess session store", () => {
  it("creates and updates a session", () => {
    const session = store.create("owner", "view", "white", [game]);
    expect(store.get(session.id)).toMatchObject({ ownerId: "owner", page: 1 });
    expect(store.update(session.id, { page: 3 })?.page).toBe(3);
  });

  it("opens each mode on its own tab", () => {
    expect(store.create("owner", "view", "white", [game]).view).toBe("board");
    expect(store.create("owner", "analyse", "white", [game]).view).toBe(
      "analyse"
    );
    expect(store.create("owner", "report", "white", [game]).view).toBe(
      "report"
    );
  });

  it("keeps the requested player for the game list", () => {
    const session = store.create("owner", "view", "white", [game], "Alice");
    expect(session.requestedPlayer).toBe("Alice");
  });

  it("forgets an analysis when a new game is parsed", () => {
    const session = store.create("owner", "analyse", "white", [game]);
    store.setAnalysis(session.id, analysis);
    const parsed = parseGame(game.pgn);
    expect(parsed).not.toBeNull();
    expect(store.setParsed(session.id, parsed!)?.analysis).toBeUndefined();
  });

  it("drops expired sessions", () => {
    const session = store.create("owner", "view", "white", [game]);
    store.update(session.id, { expiresAt: Date.now() - 1 });
    expect(store.sweep()).toBeGreaterThanOrEqual(1);
    expect(store.get(session.id)).toBeNull();
  });
});
