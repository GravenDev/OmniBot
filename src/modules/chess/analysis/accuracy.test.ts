import { describe, expect, it } from "vitest";
import type { Evaluation } from "wintrchess/engine";
import { expectedPoints, mean, moveAccuracy } from "./accuracy.js";

const cp = (value: number): Evaluation => ({ type: "cp", value });
const mate = (value: number): Evaluation => ({ type: "mate", value });

describe("WintrChess accuracy formula", () => {
  it("maps centipawns through the upstream logistic", () => {
    expect(expectedPoints(cp(0), "white")).toBeCloseTo(0.5, 5);
    expect(expectedPoints(cp(100), "white")).toBeCloseTo(0.5866176, 5);
    expect(expectedPoints(cp(-100), "white")).toBeCloseTo(0.4133824, 5);
  });

  it("treats a drawn mate as a win only for White", () => {
    expect(expectedPoints(mate(0), "white")).toBe(1);
    expect(expectedPoints(mate(0), "black")).toBe(0);
    expect(expectedPoints(mate(1), "white")).toBe(1);
    expect(expectedPoints(mate(1), "black")).toBe(1);
    expect(expectedPoints(mate(-1), "white")).toBe(0);
    expect(expectedPoints(mate(-1), "black")).toBe(0);
  });

  it("pins the upstream constants with golden values", () => {
    expect(moveAccuracy(cp(0), cp(0), "white")).toBeCloseTo(99.99, 5);
    expect(moveAccuracy(cp(0), cp(-100), "white")).toBeCloseTo(69.7827, 3);
    // Evaluations are already from the mover's perspective here.
    expect(moveAccuracy(cp(0), cp(100), "black")).toBeCloseTo(69.7827, 3);
  });

  it("accepts chessops long colours and UCI short colours alike", () => {
    expect(moveAccuracy(cp(0), cp(-100), "white")).toBe(
      moveAccuracy(cp(0), cp(-100), "w")
    );
    expect(moveAccuracy(cp(0), cp(100), "black")).toBe(
      moveAccuracy(cp(0), cp(100), "b")
    );
  });

  it("returns zero for an empty mean", () => {
    expect(mean([])).toBe(0);
    expect(mean([10, 20, 30])).toBe(20);
  });
});
