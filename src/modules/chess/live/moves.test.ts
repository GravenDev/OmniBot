import { describe, expect, it } from "vitest";
import { moveNotation, gameFromUci, sanToUci } from "./moves.js";

describe("live move parsing", () => {
  it("turns UCI moves into the same SAN steps as a PGN", () => {
    const game = gameFromUci(["e2e4", "e7e5", "g1f3"]);

    expect(game?.steps.map((step) => step.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(game?.steps.map((step) => step.color)).toEqual([
      "white",
      "black",
      "white",
    ]);
    expect(game?.positions).toHaveLength(4);
    expect(game?.steps[0]?.fenAfter).toContain(" b ");
  });

  it("writes one round per line, with -- for the missing side", () => {
    const game = gameFromUci(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"])!;

    expect(moveNotation(game.steps, game.steps.length)).toBe(
      "1. e4 e5\n2. Nf3 Nc6\n3. Bb5 --"
    );
    expect(moveNotation(game.steps, 3)).toBe("1. e4 e5\n2. Nf3 --");
    expect(moveNotation(game.steps, 0)).toBe("");
  });

  it("keeps only the last eight rounds as the game goes on", () => {
    const game = gameFromUci([
      "e2e4",
      "e7e5",
      "g1f3",
      "b8c6",
      "f1b5",
      "a7a6",
      "b5a4",
      "g8f6",
      "e1g1",
      "f8e7",
      "f1e1",
      "e8g8",
      "a4b3",
      "d7d6",
      "b3c4",
      "c8e6",
      "c4e6",
      "f7e6",
      "d2d4",
      "e5d4",
    ])!;

    expect(moveNotation(game.steps, game.steps.length).split("\n")).toEqual([
      "3. Bb5 a6",
      "4. Ba4 Nf6",
      "5. O-O Be7",
      "6. Re1 O-O",
      "7. Bb3 d6",
      "8. Bc4 Be6",
      "9. Bxe6 fxe6",
      "10. d4 exd4",
    ]);
  });

  it("keeps the starting position when the feed has no move yet", () => {
    const game = gameFromUci([]);

    expect(game).toMatchObject({ steps: [], result: "unknown" });
    expect(game?.positions).toHaveLength(1);
  });

  it("turns the SAN of a live feed back into UCI", () => {
    expect(sanToUci(["Nf3", "Nc6", "e4", "e5", "Bb5", "a6", "O-O"])).toEqual([
      "g1f3",
      "b8c6",
      "e2e4",
      "e7e5",
      "f1b5",
      "a7a6",
      "e1h1",
    ]);
    expect(sanToUci(["e4", "nonsense"])).toBeNull();
  });

  it("ignores a null move and rejects an illegal one", () => {
    expect(
      gameFromUci(["0000", "e2e4"])?.steps.map((step) => step.san)
    ).toEqual(["e4"]);
    expect(gameFromUci(["e2e5"])).toBeNull();
  });
});
