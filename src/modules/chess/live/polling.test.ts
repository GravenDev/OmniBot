import { describe, expect, it } from "vitest";
import { pollInterval } from "./polling.js";

describe("live polling", () => {
  it("checks fast games more often than long ones", () => {
    expect(pollInterval("60+0")).toBe(5_000);
    expect(pollInterval("180+2")).toBe(5_000);
    expect(pollInterval("600+5")).toBe(10_000);
    expect(pollInterval("1800+0")).toBe(10_000);
    expect(pollInterval("3600+0")).toBe(30_000);
    expect(pollInterval("1/259200")).toBe(30_000);
  });

  it("reads Chess.com, whose live feed is its web client's, at most every 15 s", () => {
    expect(pollInterval("60+0", "chesscom")).toBe(15_000);
    expect(pollInterval("600+5", "chesscom")).toBe(15_000);
    expect(pollInterval("1/259200", "chesscom")).toBe(30_000);
    expect(pollInterval("60+0", "lichess")).toBe(5_000);
  });
});
