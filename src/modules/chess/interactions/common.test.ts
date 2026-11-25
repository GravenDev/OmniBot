import { describe, expect, it } from "vitest";
import store from "../services/session.service.js";
import type { GameSummary } from "../types.js";
import { selectGame } from "./common.js";

function game(id: string, white: string, black: string): GameSummary {
  return {
    id,
    source: "lichess",
    white,
    black,
    result: "white",
    timeControl: "180+2",
    speed: "blitz",
    playedAt: null,
    url: null,
    pgn: "1. e4 e5 *",
  };
}

describe("selectGame", () => {
  it("derives the side from the requested player of the chosen game", () => {
    const session = store.create(
      "owner",
      "report",
      "white",
      [game("g1", "Alice", "Bob"), game("g2", "Carol", "Alice")],
      "Alice"
    );

    expect(selectGame(session, 0)).not.toBeNull();
    expect(session.gameIndex).toBe(0);
    expect(session.side).toBe("white");
    expect(session.flipped).toBe(false);
    expect(selectGame(session, 1)).not.toBeNull();
    expect(session.gameIndex).toBe(1);
    expect(session.side).toBe("black");
    expect(session.flipped).toBe(true);
  });

  it("keeps the explicit side when there is no requested player", () => {
    const session = store.create("owner", "report", "black", [
      game("g1", "Alice", "Bob"),
    ]);

    expect(selectGame(session, 0)).not.toBeNull();
    expect(session.side).toBe("black");
    expect(session.flipped).toBe(false);
  });
});
