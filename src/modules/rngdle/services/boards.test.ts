import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/database.js", () => ({ default: {} }));

const { utcDayRange } = await import("./boards.js");

const iso = ([from, to]: [Date, Date]) => [
  from.toISOString(),
  to.toISOString(),
];

describe("utcDayRange", () => {
  it("returns the current UTC day for day 0", () => {
    const now = new Date("2026-05-15T13:45:10.123Z");

    expect(iso(utcDayRange(0, now))).toEqual([
      "2026-05-15T00:00:00.000Z",
      "2026-05-16T00:00:00.000Z",
    ]);
  });

  it("returns the previous UTC day for day 1", () => {
    const now = new Date("2026-05-15T13:45:10.123Z");

    expect(iso(utcDayRange(1, now))).toEqual([
      "2026-05-14T00:00:00.000Z",
      "2026-05-15T00:00:00.000Z",
    ]);
  });

  it("works just after midnight UTC", () => {
    const now = new Date("2026-05-15T00:00:00.001Z");

    expect(iso(utcDayRange(0, now))).toEqual([
      "2026-05-15T00:00:00.000Z",
      "2026-05-16T00:00:00.000Z",
    ]);
    expect(iso(utcDayRange(1, now))).toEqual([
      "2026-05-14T00:00:00.000Z",
      "2026-05-15T00:00:00.000Z",
    ]);
  });

  it("works just before midnight UTC", () => {
    const now = new Date("2026-05-15T23:59:59.999Z");

    expect(iso(utcDayRange(1, now))).toEqual([
      "2026-05-14T00:00:00.000Z",
      "2026-05-15T00:00:00.000Z",
    ]);
  });

  it("crosses month boundaries", () => {
    const now = new Date("2026-03-01T00:30:00.000Z");

    expect(iso(utcDayRange(1, now))).toEqual([
      "2026-02-28T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    ]);
  });

  it("crosses year boundaries", () => {
    const now = new Date("2027-01-01T00:00:05.000Z");

    expect(iso(utcDayRange(1, now))).toEqual([
      "2026-12-31T00:00:00.000Z",
      "2027-01-01T00:00:00.000Z",
    ]);
  });

  it("handles leap days", () => {
    const now = new Date("2028-03-01T10:00:00.000Z");

    expect(iso(utcDayRange(1, now))).toEqual([
      "2028-02-29T00:00:00.000Z",
      "2028-03-01T00:00:00.000Z",
    ]);
  });

  it("defaults to the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
    try {
      expect(iso(utcDayRange(0))).toEqual([
        "2026-07-04T00:00:00.000Z",
        "2026-07-05T00:00:00.000Z",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
