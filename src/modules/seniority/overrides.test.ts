import { describe, expect, it } from "vitest";
import { seniorityStart } from "./overrides.js";

const JOINED = new Date("2024-06-01T10:00:00Z");

describe("seniorityStart", () => {
  it("takes the earlier of the arrival and the recomputed date", () => {
    const earlier = new Date("2020-01-01");
    expect(seniorityStart(JOINED, earlier)).toBe(earlier);
    expect(seniorityStart(JOINED, new Date("2025-01-01"))).toBe(JOINED);
    expect(seniorityStart(JOINED, undefined)).toBe(JOINED);
  });
});
