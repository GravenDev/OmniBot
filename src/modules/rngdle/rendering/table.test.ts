import { describe, expect, it } from "vitest";
import { formatDelta } from "./table.js";

describe("formatDelta", () => {
  it.each([
    [52_100, "+52.1k"],
    [-5_600, "-5.6k"],
    [31_400_000, "+31.4M"],
    [-999, "-999"],
    [0, "0"],
  ])("formats %d as %s", (delta, text) => {
    expect(formatDelta(delta, "en")).toBe(text);
  });

  it("uses the decimal comma in French", () => {
    expect(formatDelta(-5_600, "fr")).toBe("-5,6k");
  });
});
