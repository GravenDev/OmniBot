import { describe, expect, it } from "vitest";
import { dayOf, nextDay, previousDay, splitHold, startOfDay } from "./daily.js";

const HOUR = 3600;

describe("dayOf", () => {
  it("uses the Paris calendar day", () => {
    expect(dayOf(new Date("2026-10-13T21:59:59Z"))).toBe("2026-10-13");
    expect(dayOf(new Date("2026-10-13T22:00:00Z"))).toBe("2026-10-14");
    expect(dayOf(new Date("2026-01-15T22:59:59Z"))).toBe("2026-01-15");
    expect(dayOf(new Date("2026-01-15T23:00:00Z"))).toBe("2026-01-16");
  });
});

describe("startOfDay", () => {
  it("returns Paris midnight in summer and winter time", () => {
    expect(startOfDay("2026-10-14").toISOString()).toBe(
      "2026-10-13T22:00:00.000Z"
    );
    expect(startOfDay("2026-01-16").toISOString()).toBe(
      "2026-01-15T23:00:00.000Z"
    );
  });

  it("handles the days of the clock changes", () => {
    expect(startOfDay("2026-03-29").toISOString()).toBe(
      "2026-03-28T23:00:00.000Z"
    );
    expect(startOfDay("2026-03-30").toISOString()).toBe(
      "2026-03-29T22:00:00.000Z"
    );
    expect(startOfDay("2026-10-25").toISOString()).toBe(
      "2026-10-24T22:00:00.000Z"
    );
    expect(startOfDay("2026-10-26").toISOString()).toBe(
      "2026-10-25T23:00:00.000Z"
    );
  });
});

describe("nextDay / previousDay", () => {
  it("crosses month and year boundaries", () => {
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
  });
});

describe("splitHold", () => {
  it("keeps a hold within one day whole", () => {
    expect(
      splitHold(
        new Date("2026-10-14T08:00:00Z"),
        new Date("2026-10-14T10:30:00Z"),
        "2026-10-13"
      )
    ).toEqual([{ day: "2026-10-14", seconds: 2.5 * HOUR }]);
  });

  it("splits a hold across Paris midnight", () => {
    expect(
      splitHold(
        new Date("2026-10-13T20:00:00Z"),
        new Date("2026-10-14T01:00:00Z"),
        "2026-10-12"
      )
    ).toEqual([
      { day: "2026-10-13", seconds: 2 * HOUR },
      { day: "2026-10-14", seconds: 3 * HOUR },
    ]);
  });

  it("counts a whole day in between, 25 hours on the autumn change", () => {
    expect(
      splitHold(
        new Date("2026-10-24T21:00:00Z"),
        new Date("2026-10-26T00:00:00Z"),
        "2026-10-23"
      )
    ).toEqual([
      { day: "2026-10-24", seconds: HOUR },
      { day: "2026-10-25", seconds: 25 * HOUR },
      { day: "2026-10-26", seconds: HOUR },
    ]);
  });

  it("skips the days already closed", () => {
    expect(
      splitHold(
        new Date("2026-10-13T20:00:00Z"),
        new Date("2026-10-14T01:00:00Z"),
        "2026-10-13"
      )
    ).toEqual([{ day: "2026-10-14", seconds: 3 * HOUR }]);
  });

  it("returns nothing when every day is closed or the hold is empty", () => {
    const at = new Date("2026-10-14T08:00:00Z");
    expect(splitHold(at, at, "2026-10-13")).toEqual([]);
    expect(
      splitHold(at, new Date("2026-10-14T09:00:00Z"), "2026-10-14")
    ).toEqual([]);
  });
});
