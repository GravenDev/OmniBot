import { describe, expect, it } from "vitest";
import { dateFromHeaders, parseGame, resultFromTag } from "./pgn.js";

const COMPLEX_PGN = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "*"]
[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]

1. e4 { a comment } e5 2. Nf3 (2. Bc4 Nc6) 2... Nc6 $1 3. Bb5 a6 *`;

describe("PGN parsing", () => {
  it("reads the headers and the result tag", () => {
    const game = parseGame(COMPLEX_PGN);
    expect(game).not.toBeNull();
    expect(game!.headers.get("White")).toBe("Alice");
    expect(game!.headers.get("FEN")).toMatch(/^rnbqkbnr/);
    expect(resultFromTag(game!.headers.get("Result"))).toBe("unknown");
    expect(resultFromTag("1-0")).toBe("white");
    expect(resultFromTag("0-1")).toBe("black");
    expect(resultFromTag("1/2-1/2")).toBe("draw");
  });

  it("keeps only the mainline, ignoring variations, comments and NAGs", () => {
    const game = parseGame(COMPLEX_PGN)!;
    expect(game.steps.map((step) => step.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bb5",
      "a6",
    ]);
    expect(game.steps.map((step) => step.color)).toEqual([
      "white",
      "black",
      "white",
      "black",
      "white",
      "black",
    ]);
    expect(game.steps.at(-1)?.to).toBe(40); // a6, from a7
  });

  it("stores a position before and after every move, in sequence", () => {
    const game = parseGame(COMPLEX_PGN)!;
    expect(game.positions).toHaveLength(game.steps.length + 1);
    for (const [i, step] of game.steps.entries()) {
      expect(game.positions[i]).toBeDefined();
      expect(game.positions[i + 1]).toBeDefined();
      expect(typeof step.fenBefore).toBe("string");
      expect(typeof step.fenAfter).toBe("string");
      if (i > 0) {
        expect(game.steps[i - 1]!.fenAfter).toBe(step.fenBefore);
      }
    }
    expect(game.steps[0]!.fenBefore).toContain(" w KQkq ");
    expect(game.steps.at(-1)?.fenAfter).toContain(" w KQkq ");
  });

  it("keeps a game with no move at the starting position", () => {
    const game = parseGame('[White "Alice"]\n[Black "Bob"]\n\n*');

    expect(game).toMatchObject({ steps: [], result: "unknown" });
    expect(game?.positions).toHaveLength(1);
    expect(game?.headers.get("White")).toBe("Alice");
  });

  it("rejects a game whose move list cannot be read", () => {
    const game = parseGame(
      '[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nonsense Nc6 1-0'
    );
    expect(game).toBeNull();
  });

  it("falls back to the Date and EndDate tags", () => {
    expect(dateFromHeaders(new Map([["Date", "2026.11.25"]]))).toEqual(
      new Date("2026-11-25T00:00:00Z")
    );
    expect(
      dateFromHeaders(
        new Map([
          ["UTCDate", "2026.11.24"],
          ["Date", "2026.11.25"],
        ])
      )
    ).toEqual(new Date("2026-11-24T00:00:00Z"));
    expect(dateFromHeaders(new Map())).toBeNull();
  });
});
