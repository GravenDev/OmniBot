import { describe, expect, it } from "vitest";
import { compare, previousDays } from "./insights.js";

const NO_ACTIVITY = { joins: 0, messages: 0, activeMembers: 0, reactions: 0 };

const day = new Date("2026-10-28T00:00:00Z");

const totals = (messages: number) => ({ ...NO_ACTIVITY, messages });

describe("previousDays", () => {
  it("lists the days before, most recent first, up to the limit", () => {
    const days = previousDays(day, new Date("2026-01-01T10:00:00Z"), 3);
    expect(days.map((previous) => previous.toISOString())).toEqual([
      "2026-10-27T00:00:00.000Z",
      "2026-10-26T00:00:00.000Z",
      "2026-10-25T00:00:00.000Z",
    ]);
  });

  it("skips the partial day counting started on, and the days before it", () => {
    const days = previousDays(day, new Date("2026-10-25T14:00:00Z"), 90);
    expect(days.map((previous) => previous.toISOString())).toEqual([
      "2026-10-27T00:00:00.000Z",
      "2026-10-26T00:00:00.000Z",
    ]);
  });

  it("is empty on the first days of counting", () => {
    expect(previousDays(day, new Date("2026-10-27T09:00:00Z"), 90)).toEqual([]);
  });
});

describe("compare", () => {
  it("compares with the average of the last 7 days only", () => {
    const previous = [
      ...Array.from({ length: 7 }, () => totals(100)),
      totals(10_000),
    ];
    expect(compare(totals(150), previous).messages.change).toBeCloseTo(0.5);
  });

  it("has no trend before 7 counted days", () => {
    const sixDays = Array.from({ length: 6 }, () => totals(100));
    expect(compare(totals(150), sixDays).messages.change).toBeNull();
  });

  it("has no trend without a previous day or with a zero average", () => {
    expect(compare(totals(10), []).messages.change).toBeNull();
    expect(
      compare(
        totals(10),
        Array.from({ length: 7 }, () => totals(0))
      ).messages.change
    ).toBeNull();
  });

  it("marks a record only above every compared day, after a week", () => {
    const week = Array.from({ length: 7 }, (_, index) => totals(100 + index));
    expect(compare(totals(107), week).messages.record).toBe(true);
    expect(compare(totals(106), week).messages.record).toBe(false);
    expect(compare(totals(500), week.slice(1)).messages.record).toBe(false);
  });

  it("needs a value of at least 5 for a record", () => {
    const quiet = Array.from({ length: 7 }, () => NO_ACTIVITY);
    expect(compare(NO_ACTIVITY, quiet).joins.record).toBe(false);
    expect(compare({ ...NO_ACTIVITY, joins: 4 }, quiet).joins.record).toBe(
      false
    );
    expect(compare({ ...NO_ACTIVITY, joins: 5 }, quiet).joins.record).toBe(
      true
    );
  });
});
