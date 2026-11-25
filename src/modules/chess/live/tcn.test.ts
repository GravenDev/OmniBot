import { describe, expect, it } from "vitest";
import { gameFromUci } from "./moves.js";
import { decodeTcn } from "./tcn.js";

describe("Chess.com TCN", () => {
  it("decodes a real game's opening into playable UCI moves", () => {
    const moves = decodeTcn("gv5QmCZJft");

    expect(moves).toEqual(["g1f3", "b8c6", "e2e4", "d7d5", "f1d3"]);
    expect(gameFromUci(moves!)?.steps.map((step) => step.san)).toEqual([
      "Nf3",
      "Nc6",
      "e4",
      "d5",
      "Bd3",
    ]);
  });

  it("rejects a malformed list instead of showing a wrong board", () => {
    expect(decodeTcn("")).toEqual([]);
    expect(decodeTcn("abc")).toBeNull();
    expect(decodeTcn("a!")).toHaveLength(1);
    expect(decodeTcn("~~")).toBeNull();
    // A drop has no origin square: decoding it as a normal move would shift
    // every move that follows.
    expect(decodeTcn("&geg")).toBeNull();
  });
});
