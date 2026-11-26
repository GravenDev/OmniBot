import { describe, expect, it } from "vitest";
import store from "../services/session.service.js";
import type { GameSummary } from "../types.js";
import { openGame, selectGame } from "./common.js";

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

describe("openGame", () => {
  it("gives every published board its own session, apart from the list", () => {
    const list = store.create("owner", "view", "white", [
      game("g1", "Alice", "Bob"),
      game("g2", "Carol", "Dave"),
    ]);

    const first = openGame(list, 0);
    const second = openGame(list, 1);

    expect(first?.id).not.toBe(second?.id);
    expect(first?.id).not.toBe(list.id);
    // Picking the second game leaves the first board on its own game.
    expect(store.get(first!.id)?.games[0]?.id).toBe("g1");
    expect(store.get(second!.id)?.games[0]?.id).toBe("g2");
    expect(store.get(first!.id)?.parsed).not.toBe(
      store.get(second!.id)?.parsed
    );
    expect(list.parsed).toBeUndefined();
  });

  it("keeps the owner, the mode and the requested player of the list", () => {
    const list = store.create(
      "owner",
      "report",
      "white",
      [game("g1", "Carol", "Alice")],
      "Alice"
    );

    const board = openGame(list, 0);

    expect(board).toMatchObject({
      ownerId: "owner",
      mode: "report",
      side: "black",
      flipped: true,
      requestedPlayer: "Alice",
    });
  });

  it("returns null for a missing game", () => {
    const list = store.create("owner", "view", "white", []);
    expect(openGame(list, 3)).toBeNull();
  });
});
