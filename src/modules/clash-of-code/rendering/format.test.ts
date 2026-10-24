import { describe, expect, it } from "vitest";
import { formatDuration } from "./format.js";

describe("formatDuration", () => {
  it("shows seconds under a minute", () => {
    expect(formatDuration(45_400)).toBe("45s");
  });

  it("shows minutes and padded seconds", () => {
    expect(formatDuration(146_704)).toBe("2m 27s");
    expect(formatDuration(60_000)).toBe("1m 00s");
  });
});
