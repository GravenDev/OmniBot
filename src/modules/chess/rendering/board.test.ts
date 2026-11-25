import { describe, expect, it } from "vitest";
import {
  BADGE,
  boardSquare,
  COORD,
  piecesFromFen,
  ratingBadgePosition,
  SQUARE,
} from "./board.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("board rendering geometry", () => {
  it("keeps a1 at the bottom left and h8 at the top right", () => {
    expect(boardSquare(0, false).x).toBeCloseTo(COORD, 6);
    expect(boardSquare(0, false).y).toBeCloseTo(COORD + 7 * SQUARE, 6);
    expect(boardSquare(63, false).x).toBeCloseTo(COORD + 7 * SQUARE, 6);
    expect(boardSquare(63, false).y).toBeCloseTo(COORD, 6);
  });

  it("flips the squares without moving the pieces' own coordinates", () => {
    expect(boardSquare(0, true).x).toBeCloseTo(COORD + 7 * SQUARE, 6);
    expect(boardSquare(0, true).y).toBeCloseTo(COORD, 6);
    expect(boardSquare(63, true).x).toBeCloseTo(COORD, 6);
    expect(boardSquare(63, true).y).toBeCloseTo(COORD + 7 * SQUARE, 6);
  });

  it("offsets the badge a quarter of its size inside the top-right corner", () => {
    const inset = Math.round(BADGE * 0.25);
    const square = boardSquare(12);
    const badge = ratingBadgePosition(12);
    expect(badge.x).toBeCloseTo(square.x + SQUARE - BADGE + inset, 6);
    expect(badge.y).toBeCloseTo(square.y - inset, 6);
  });

  it("places every FEN piece on the square named by its rank and file", () => {
    const pieces = piecesFromFen(START_FEN);
    expect(pieces).toHaveLength(32);
    expect(pieces.find((piece) => piece.square === 0)).toMatchObject({
      key: "wR",
    });
    expect(pieces.find((piece) => piece.square === 12)).toMatchObject({
      key: "wP",
    });
    expect(pieces.find((piece) => piece.square === 60)).toMatchObject({
      key: "bK",
    });
  });
});
