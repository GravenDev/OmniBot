import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./duration.js";

describe("parseDuration", () => {
  it.each([
    ["30s", 30],
    ["5m", 5 * 60],
    ["4h", 4 * 60 * 60],
    ["3d", 3 * 24 * 60 * 60],
    ["1h30m", 90 * 60],
    ["1d2h3m4s", 24 * 3600 + 2 * 3600 + 3 * 60 + 4],
    [" 4H ", 4 * 60 * 60],
    ["1h 30m", 90 * 60],
    ["90m", 90 * 60],
  ])("parses %j as %d seconds", (raw, expected) => {
    expect(parseDuration(raw)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "4",
    "h",
    "4x",
    "-4h",
    "4.5h",
    "4h-",
    "0s",
    "0h0m",
    "abc",
  ])("rejects %j", (raw) => {
    expect(parseDuration(raw)).toBeNull();
  });

  it("rejects values beyond the safe integer range", () => {
    expect(parseDuration("99999999999999999999d")).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [30, "30s"],
    [300, "5m"],
    [4 * 3600, "4h"],
    [3 * 86400, "3d"],
    [5400, "1h30m"],
    [86400 + 7200 + 180 + 4, "1d2h3m4s"],
  ])("formats %d as %j", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("round-trips through parseDuration", () => {
    for (const seconds of [1, 59, 61, 3599, 3601, 86399, 90061]) {
      expect(parseDuration(formatDuration(seconds))).toBe(seconds);
    }
  });

  it.each([0, -5, Number.NaN])("formats the degenerate value %d as 0s", (v) => {
    expect(formatDuration(v)).toBe("0s");
  });
});
