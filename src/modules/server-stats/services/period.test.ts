import { describe, expect, it } from "vitest";
import {
  countedPart,
  dayChoices,
  oldestDay,
  parseDay,
  selectDay,
  selectPeriod,
  selectToday,
} from "./period.js";

// Friday 30 October 2026, 14:32 in Paris.
const now = new Date("2026-10-30T13:32:00Z");

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const noDates = { days: null, from: null, to: null };

describe("parseDay", () => {
  it("reads ISO and day-first dates", () => {
    expect(parseDay("2026-10-29", now)).toEqual(day("2026-10-29"));
    expect(parseDay(" 29/10/2026 ", now)).toEqual(day("2026-10-29"));
    expect(parseDay("1.10.2026", now)).toEqual(day("2026-10-01"));
  });

  it("gives a day without its year the last year it came", () => {
    expect(parseDay("29/10", now)).toEqual(day("2026-10-29"));
    expect(parseDay("28/12", now)).toEqual(day("2025-12-28"));
    expect(parseDay("30/10", now)).toEqual(day("2026-10-30"));
  });

  it("uses the Paris day to place a date without its year", () => {
    // Already 1 January 2027 in Paris.
    const newYear = new Date("2026-12-31T23:30:00Z");
    expect(parseDay("01/01", newYear)).toEqual(day("2027-01-01"));
  });

  it("rejects what is not a calendar day", () => {
    expect(parseDay("31/02/2026", now)).toBeNull();
    expect(parseDay("2026-13-01", now)).toBeNull();
    expect(parseDay("yesterday", now)).toBeNull();
    expect(parseDay("", now)).toBeNull();
  });
});

describe("oldestDay", () => {
  it("keeps today and the 30 days before it", () => {
    expect(oldestDay(now)).toEqual(day("2026-09-30"));
  });
});

describe("selectToday", () => {
  it("selects the Paris day", () => {
    expect(selectToday(new Date("2026-10-30T23:30:00Z"))).toEqual({
      selection: { from: day("2026-10-31"), to: day("2026-10-31") },
    });
  });
});

describe("selectDay", () => {
  it("selects one kept day, today and the oldest included", () => {
    for (const iso of ["2026-10-29", "2026-10-30", "2026-09-30"]) {
      expect(selectDay(iso, now)).toEqual({
        selection: { from: day(iso), to: day(iso) },
      });
    }
  });

  it("refuses a day to come, one no longer kept, or an unreadable one", () => {
    expect(selectDay("2026-10-31", now)).toEqual({ error: "future" });
    expect(selectDay("2026-09-29", now)).toEqual({
      error: "tooOld",
      oldest: day("2026-09-30"),
    });
    expect(selectDay("demain", now)).toEqual({
      error: "invalidDate",
      value: "demain",
    });
  });
});

describe("selectPeriod", () => {
  it("defaults to the last 7 whole days, today left out", () => {
    expect(selectPeriod(noDates, now)).toEqual({
      selection: { from: day("2026-10-23"), to: day("2026-10-29") },
    });
  });

  it("takes the last 30 whole days", () => {
    expect(selectPeriod({ ...noDates, days: 30 }, now)).toEqual({
      selection: { from: day("2026-09-30"), to: day("2026-10-29") },
    });
  });

  it("runs from the first day to today by default", () => {
    expect(selectPeriod({ ...noDates, from: "20/10" }, now)).toEqual({
      selection: { from: day("2026-10-20"), to: day("2026-10-30") },
    });
  });

  it("starts with the oldest kept day by default", () => {
    expect(selectPeriod({ ...noDates, to: "2026-10-10" }, now)).toEqual({
      selection: { from: day("2026-09-30"), to: day("2026-10-10") },
    });
  });

  it("puts dates given in reverse back in order", () => {
    expect(
      selectPeriod({ ...noDates, from: "25/10", to: "20/10" }, now)
    ).toEqual({
      selection: { from: day("2026-10-20"), to: day("2026-10-25") },
    });
  });

  it("refuses a number of days together with dates", () => {
    expect(selectPeriod({ days: 7, from: "20/10", to: null }, now)).toEqual({
      error: "daysAndDates",
    });
  });

  it("checks each date like a single day", () => {
    expect(selectPeriod({ ...noDates, from: "01/09" }, now)).toEqual({
      error: "tooOld",
      oldest: day("2026-09-30"),
    });
    expect(selectPeriod({ ...noDates, from: "20/10", to: "x" }, now)).toEqual({
      error: "invalidDate",
      value: "x",
    });
  });
});

describe("countedPart", () => {
  const selection = { from: day("2026-10-20"), to: day("2026-10-29") };

  it("keeps a selection counted in full", () => {
    expect(countedPart(selection, new Date("2026-10-01T10:00:00Z"))).toBe(
      selection
    );
  });

  it("starts the selection on the day counting started", () => {
    expect(countedPart(selection, new Date("2026-10-24T23:30:00Z"))).toEqual({
      from: day("2026-10-25"),
      to: day("2026-10-29"),
    });
  });

  it("is null for a selection ending before counting started", () => {
    expect(countedPart(selection, new Date("2026-10-30T08:00:00Z"))).toBeNull();
  });
});

describe("dayChoices", () => {
  it("lists the kept days, most recent first", () => {
    const choices = dayChoices(now, (_day, offset) => `${offset}`);
    expect(choices).toHaveLength(31);
    expect(choices[0]).toEqual({ name: "0", value: "2026-10-30" });
    expect(choices[1]).toEqual({ name: "1", value: "2026-10-29" });
    expect(choices.at(-1)).toEqual({ name: "30", value: "2026-09-30" });
  });
});
