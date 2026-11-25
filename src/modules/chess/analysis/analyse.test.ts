import { describe, expect, it } from "vitest";
import type { EngineLine, Evaluation } from "wintrchess/engine";
import { contextualizeMove } from "wintrchess/types";
import { parseGame } from "../games/pgn.js";
import { RATING_ORDER } from "../ratings.js";
import type { ParsedGame } from "../types.js";
import { moveAccuracy } from "./accuracy.js";
import { buildAnalysis } from "./analyse.js";

const PGN = `[Event "Test"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

const game = parseGame(PGN) as ParsedGame;

function linesFor(values: number[]): EngineLine[][] {
  return game.positions.map((position, i) => {
    const move = game.steps[i]?.move;
    const evaluation: Evaluation = { type: "cp", value: values[i] ?? 0 };
    return [
      {
        depth: 12,
        index: 1,
        moves: move ? [contextualizeMove(position, move)] : [],
        evaluation,
      },
    ];
  });
}

describe("buildAnalysis", () => {
  it("falls back to best and neutral accuracy without engine lines", () => {
    const analysis = buildAnalysis([], game);

    expect(analysis.ratings).toEqual(game.steps.map(() => "best"));
    expect(analysis.evaluations).toEqual(
      game.positions.map(() => ({ type: "cp", value: 0 }))
    );
    expect(analysis.counts).toEqual({
      white: [{ rating: "best", count: 2 }],
      black: [{ rating: "best", count: 2 }],
    });
    // moveAccuracy(neutral, neutral) is 103.16 - 3.17.
    expect(analysis.accuracies.white).toBeCloseTo(99.99);
    expect(analysis.accuracies.black).toBeCloseTo(99.99);
  });

  it("averages per-move accuracy for each side", () => {
    // Every move is a blunder from the mover's point of view: White drops from
    // +100 to -100, Black from -100 to +100, and so on. Both sides must lose
    // the same accuracy: the formula takes White-relative engine evaluations.
    const values = [100, -100, 100, -100, 100];
    const evaluations: Evaluation[] = values.map((value) => ({
      type: "cp",
      value,
    }));
    const analysis = buildAnalysis(linesFor(values), game);
    expect(analysis.evaluations).toEqual(evaluations);
    const expectedWhite =
      (moveAccuracy(evaluations[0]!, evaluations[1]!, "white") +
        moveAccuracy(evaluations[2]!, evaluations[3]!, "white")) /
      2;
    const expectedBlack =
      (moveAccuracy(evaluations[1]!, evaluations[2]!, "black") +
        moveAccuracy(evaluations[3]!, evaluations[4]!, "black")) /
      2;

    expect(analysis.accuracies.white).toBeCloseTo(expectedWhite);
    expect(analysis.accuracies.black).toBeCloseTo(expectedBlack);
    expect(analysis.accuracies.black).toBeCloseTo(analysis.accuracies.white);
    expect(analysis.accuracies.black).toBeLessThan(60);
  });

  it("counts every move once, ordered by RATING_ORDER", () => {
    const analysis = buildAnalysis(linesFor([0, 100, 600, 1200, 1500]), game);

    for (const side of ["white", "black"] as const) {
      const counts = analysis.counts[side];
      const ratings = counts.map(({ rating }) => rating);
      expect(ratings).toEqual(RATING_ORDER.filter((r) => ratings.includes(r)));
      expect(counts.every(({ count }) => count > 0)).toBe(true);
      expect(counts.reduce((total, { count }) => total + count, 0)).toBe(2);
    }
    expect(analysis.ratings).toHaveLength(game.steps.length);
  });
});
