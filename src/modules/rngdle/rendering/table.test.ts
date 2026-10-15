import { describe, expect, it } from "vitest";
import { formatDelta, tableHeight } from "./table.js";

describe("formatDelta", () => {
  it.each([
    [52_100, "+52.1k"],
    [-5_600, "-5.6k"],
    [31_400_000, "+31.4M"],
    [-999, "-999"],
    [0, "0"],
  ])("formats %d as %s", (delta, text) => {
    expect(formatDelta(delta)).toBe(text);
  });
});

describe("tableHeight", () => {
  it("adds one row per entry and room for an extra row below a separator", () => {
    expect(tableHeight(0)).toBe(64);
    expect(tableHeight(3)).toBe(64 + 3 * 58);
    expect(tableHeight(3, true)).toBe(64 + 4 * 58 + 14);
  });
});
