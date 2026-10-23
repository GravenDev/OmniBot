import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  nextUtcMidnight,
  startOfUtcDay,
  utcDayNumber,
} from "./days.js";

describe("UTC days", () => {
  const lateNight = new Date("2026-10-22T23:59:59.999Z");

  it("starts and ends the day at midnight UTC", () => {
    expect(startOfUtcDay(lateNight)).toEqual(new Date("2026-10-22T00:00:00Z"));
    expect(nextUtcMidnight(lateNight)).toEqual(
      new Date("2026-10-23T00:00:00Z")
    );
  });

  it("numbers the dates of a same UTC day alike", () => {
    const midnight = new Date("2026-10-22T00:00:00Z");
    expect(utcDayNumber(lateNight)).toBe(utcDayNumber(midnight));
    expect(utcDayNumber(new Date(midnight.getTime() + DAY_MS))).toBe(
      utcDayNumber(midnight) + 1
    );
  });
});
