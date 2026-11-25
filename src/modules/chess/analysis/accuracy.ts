import type { Color } from "chessops";
import type { Evaluation } from "wintrchess/engine";

const CENTIPAWN_GRADIENT = 0.0035;

// chessops and WintrChess's reporter both use long colour names; accept UCI's
// short form too so either caller gets the same accuracy.
function isWhite(color: string): boolean {
  return color === "w" || color === "white";
}

export function expectedPoints(evaluation: Evaluation, color: Color): number {
  if (evaluation.type === "mate") {
    if (evaluation.value === 0) return Number(isWhite(color));
    return Number(evaluation.value > 0);
  }
  return 1 / (1 + Math.exp(-CENTIPAWN_GRADIENT * evaluation.value));
}

export function expectedPointsLoss(
  previous: Evaluation,
  current: Evaluation,
  color: Color
): number {
  const other: Color = isWhite(color) ? "black" : "white";
  return Math.max(
    0,
    (expectedPoints(previous, other) - expectedPoints(current, color)) *
      (isWhite(color) ? 1 : -1)
  );
}

/**
 * Accuracy of one move, from WintrChess's GPL-3.0 reporter
 * (shared/src/lib/reporter/accuracy.ts). Kept local: their public analysis
 * endpoint requires a site session cookie.
 */
export function moveAccuracy(
  previous: Evaluation,
  current: Evaluation,
  color: Color
): number {
  return (
    103.16 * Math.exp(-4 * expectedPointsLoss(previous, current, color)) - 3.17
  );
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
