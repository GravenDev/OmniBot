import { describe, expect, it } from "vitest";
import { livePly } from "./types.js";

describe("live navigation", () => {
  it("stays inside the played moves", () => {
    expect(livePly(12, 5, "first")).toBe(0);
    expect(livePly(12, 5, "prev")).toBe(4);
    expect(livePly(12, 5, "next")).toBe(6);
    expect(livePly(12, 5, "last")).toBe(12);
    expect(livePly(12, 0, "prev")).toBe(0);
    expect(livePly(12, 12, "next")).toBe(12);
  });
});
