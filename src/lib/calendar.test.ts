import { describe, expect, it } from "vitest";
import {
  addDays,
  announcementHour,
  anniversaryYears,
  celebratesOn,
  dayKey,
  dueDay,
  formatDate,
  formatDayOfYear,
  isValidDayOfYear,
  localTime,
  upcoming,
  TIME_ZONES,
} from "./calendar.js";

describe("localTime", () => {
  it("reads the wall clock of the time zone", () => {
    const at = new Date("2026-03-01T23:30:00Z");
    expect(localTime(at, "Europe/Paris")).toEqual({
      year: 2026,
      month: 3,
      day: 2,
      hour: 0,
    });
    expect(localTime(at, "America/Toronto")).toEqual({
      year: 2026,
      month: 3,
      day: 1,
      hour: 18,
    });
  });

  it.each(TIME_ZONES)("knows the configurable zone %s", (zone) => {
    expect(() => localTime(new Date(), zone)).not.toThrow();
  });
});

describe("dayKey", () => {
  it("pads the date", () => {
    expect(dayKey({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });
});

describe("isValidDayOfYear", () => {
  it.each([
    [1, 1, true],
    [31, 12, true],
    [29, 2, true],
    [30, 2, false],
    [31, 4, false],
    [0, 5, false],
    [1, 13, false],
    [1.5, 3, false],
  ])("day %s of month %s → %s", (day, month, valid) => {
    expect(isValidDayOfYear({ day, month })).toBe(valid);
  });
});

describe("celebratesOn", () => {
  const leapling = { day: 29, month: 2 };

  it("matches the day and the month", () => {
    expect(
      celebratesOn({ day: 14, month: 3 }, { year: 2026, month: 3, day: 14 })
    ).toBe(true);
    expect(
      celebratesOn({ day: 14, month: 3 }, { year: 2026, month: 3, day: 15 })
    ).toBe(false);
  });

  it("celebrates 29 February on the 28th outside leap years", () => {
    expect(celebratesOn(leapling, { year: 2027, month: 2, day: 28 })).toBe(
      true
    );
    expect(celebratesOn(leapling, { year: 2027, month: 3, day: 1 })).toBe(
      false
    );
  });

  it("celebrates 29 February on the 29th in leap years", () => {
    expect(celebratesOn(leapling, { year: 2028, month: 2, day: 29 })).toBe(
      true
    );
    expect(celebratesOn(leapling, { year: 2028, month: 2, day: 28 })).toBe(
      false
    );
  });
});

describe("addDays", () => {
  it("crosses months and years", () => {
    expect(addDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({
      year: 2027,
      month: 1,
      day: 2,
    });
  });
});

describe("anniversaryYears", () => {
  it("counts full years in the guild's time zone", () => {
    // 23:30 UTC on 14 March is already 15 March in Paris.
    const joined = new Date("2023-03-14T23:30:00Z");
    expect(
      anniversaryYears(
        joined,
        { year: 2026, month: 3, day: 15 },
        "Europe/Paris"
      )
    ).toBe(3);
    expect(
      anniversaryYears(
        joined,
        { year: 2026, month: 3, day: 14 },
        "Europe/Paris"
      )
    ).toBeNull();
  });

  it("ignores the day itself", () => {
    expect(
      anniversaryYears(
        new Date("2026-03-14T12:00:00Z"),
        { year: 2026, month: 3, day: 14 },
        "UTC"
      )
    ).toBeNull();
  });
});

describe("upcoming", () => {
  it("lists the next birthdays, soonest first", () => {
    const entries = [
      { id: "later", day: 20, month: 1 },
      { id: "today", day: 30, month: 12 },
      { id: "far", day: 1, month: 6 },
      { id: "soon", day: 2, month: 1 },
    ];
    const result = upcoming(entries, { year: 2026, month: 12, day: 30 }, 30);
    expect(result.map(({ entry, inDays }) => [entry.id, inDays])).toEqual([
      ["today", 0],
      ["soon", 3],
      ["later", 21],
    ]);
  });
});

describe("formatDayOfYear", () => {
  it("formats without a year", () => {
    expect(formatDayOfYear({ day: 14, month: 3 }, "fr")).toBe("14 mars");
    expect(formatDayOfYear({ day: 29, month: 2 }, "en")).toBe("February 29");
  });

  it("writes the first of the month 1er in French only", () => {
    expect(formatDayOfYear({ day: 1, month: 11 }, "fr")).toBe("1er novembre");
    expect(formatDayOfYear({ day: 11, month: 11 }, "fr")).toBe("11 novembre");
    expect(formatDayOfYear({ day: 1, month: 11 }, "en")).toBe("November 1");
  });
});

describe("formatDate", () => {
  it("formats the day in the time zone, with its year", () => {
    // 23:30 UTC on 31 October is already 1 November in Paris.
    const date = new Date("2021-10-31T23:30:00Z");
    expect(formatDate(date, "fr", "Europe/Paris")).toBe("1er novembre 2021");
    expect(formatDate(date, "en", "UTC")).toBe("October 31, 2021");
  });
});

describe("announcementHour", () => {
  it("keeps the hour within the day", () => {
    expect(announcementHour(9.7)).toBe(9);
    expect(announcementHour(-3)).toBe(0);
    expect(announcementHour(40)).toBe(23);
    expect(announcementHour(Number.NaN)).toBe(9);
  });
});

describe("dueDay", () => {
  // 16 October 2026, 09:00 in Paris.
  const nine = new Date("2026-10-16T07:00:00Z");

  it("waits for the announcement hour", () => {
    expect(dueDay(nine, "Europe/Paris", 10, null)).toBeNull();
    expect(dueDay(nine, "Europe/Paris", 9, null)).toBe("2026-10-16");
  });

  it("comes once per local day", () => {
    expect(dueDay(nine, "Europe/Paris", 9, "2026-10-16")).toBeNull();
    expect(dueDay(nine, "Europe/Paris", 9, "2026-10-15")).toBe("2026-10-16");
  });

  it("never goes back to a day already announced", () => {
    // Announced on the 16th in Tokyo, then the guild moves to Los Angeles,
    // where it is still the 15th.
    expect(dueDay(nine, "America/Los_Angeles", 0, "2026-10-16")).toBeNull();
  });
});
