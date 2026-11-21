import { describe, expect, it } from "vitest";
import { parsePeriod, periodRange, utcDayRange } from "./periods.js";

describe("utcDayRange", () => {
  const now = new Date("2026-03-01T15:30:00Z");

  it("covers the current UTC day", () => {
    const [from, to] = utcDayRange(0, now);

    expect(from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });

  it("goes back across a month boundary", () => {
    const [from, to] = utcDayRange(1, now);

    expect(from.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("periodRange", () => {
  const iso = (range: { from?: Date; to?: Date }) => [
    range.from?.toISOString(),
    range.to?.toISOString(),
  ];

  it("is unbounded for all time", () => {
    expect(periodRange("all")).toEqual({});
  });

  it("covers the calendar month in UTC", () => {
    expect(iso(periodRange("month", new Date("2026-12-31T23:59:00Z")))).toEqual(
      ["2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]
    );
  });

  it("covers the ISO week, Monday to Monday, in UTC", () => {
    const week = ["2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z"];

    expect(iso(periodRange("week", new Date("2026-10-05T00:00:00Z")))).toEqual(
      week
    );
    expect(iso(periodRange("week", new Date("2026-10-11T23:59:59Z")))).toEqual(
      week
    );
  });

  it("crosses month and year boundaries for a week", () => {
    expect(iso(periodRange("week", new Date("2027-01-01T12:00:00Z")))).toEqual([
      "2026-12-28T00:00:00.000Z",
      "2027-01-04T00:00:00.000Z",
    ]);
  });
});

describe("parsePeriod", () => {
  it("accepts known periods and falls back to all time", () => {
    expect(parsePeriod("week")).toBe("week");
    expect(parsePeriod("month")).toBe("month");
    expect(parsePeriod(undefined)).toBe("all");
    expect(parsePeriod(null)).toBe("all");
    expect(parsePeriod("year")).toBe("all");
  });
});
