import { describe, expect, it } from "vitest";
import { addDays, dayOf, hourOf } from "./day.js";

describe("dayOf", () => {
  it("uses the Paris calendar day", () => {
    expect(dayOf(new Date("2026-10-13T21:59:59Z")).toISOString()).toBe(
      "2026-10-13T00:00:00.000Z"
    );
    expect(dayOf(new Date("2026-10-13T22:00:00Z")).toISOString()).toBe(
      "2026-10-14T00:00:00.000Z"
    );
  });

  it("follows the winter offset", () => {
    expect(dayOf(new Date("2026-12-31T22:59:59Z")).toISOString()).toBe(
      "2026-12-31T00:00:00.000Z"
    );
    expect(dayOf(new Date("2026-12-31T23:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z"
    );
  });
});

describe("hourOf", () => {
  it("uses the Paris hour, summer and winter", () => {
    expect(hourOf(new Date("2026-10-13T21:59:59Z"))).toBe(23);
    expect(hourOf(new Date("2026-10-13T22:00:00Z"))).toBe(0);
    expect(hourOf(new Date("2026-12-31T23:30:00Z"))).toBe(0);
    expect(hourOf(new Date("2026-12-31T12:00:00Z"))).toBe(13);
  });
});

describe("addDays", () => {
  it("moves by whole days, across a daylight saving change", () => {
    const day = new Date("2026-10-26T00:00:00Z");
    expect(addDays(day, -1).toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(addDays(day, -90).toISOString()).toBe("2026-07-28T00:00:00.000Z");
  });
});
