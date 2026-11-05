import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  calendarAlt,
  calendarLabels,
  leadingDays,
  monthCelebrants,
} from "./calendar.js";

beforeAll(async () => {
  await initTestI18n("birthday", { en, fr });
});

const leap = { userId: "leap", day: 29, month: 2, announce: true };

describe("monthCelebrants", () => {
  it("puts each announced member on their day, and nobody else", () => {
    const days = monthCelebrants(
      [
        { userId: "a", day: 1, month: 11, announce: true },
        { userId: "hidden", day: 1, month: 11, announce: false },
        { userId: "b", day: 30, month: 11, announce: true },
        { userId: "c", day: 1, month: 12, announce: true },
      ],
      2026,
      11
    );
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual(["a"]);
    expect(days[29]).toEqual(["b"]);
    expect(days.flat()).toEqual(["a", "b"]);
  });

  it("celebrates 29 February on the 28th outside leap years", () => {
    expect(monthCelebrants([leap], 2027, 2)).toHaveLength(28);
    expect(monthCelebrants([leap], 2027, 2)[27]).toEqual(["leap"]);
    expect(monthCelebrants([leap], 2028, 2)[28]).toEqual(["leap"]);
    expect(monthCelebrants([leap], 2028, 2)[27]).toEqual([]);
  });
});

describe("leadingDays", () => {
  it("starts the week on Monday in French, Sunday in English", () => {
    // 1 November 2026 is a Sunday.
    expect(leadingDays(2026, 11, "fr")).toBe(6);
    expect(leadingDays(2026, 11, "en")).toBe(0);
    // 1 February 2027 is a Monday.
    expect(leadingDays(2027, 2, "fr")).toBe(0);
  });
});

describe("calendarLabels", () => {
  it("names the month and the weekdays in column order", () => {
    const labels = calendarLabels(createT("fr", "birthday"), "fr", {
      year: 2026,
      month: 4,
      day: 1,
    });
    expect(labels.title).toBe("Les anniversaires d'avril");
    expect(labels.kicker).toBe("Calendrier 2026");
    expect(labels.weekdays[0]).toBe("lun.");
    expect(labels.weekdays[6]).toBe("dim.");
    expect(labels.several(2)).toBe("2 anniversaires");
    expect(
      calendarLabels(createT("en", "birthday"), "en", {
        year: 2026,
        month: 4,
        day: 1,
      }).weekdays[0]
    ).toBe("Sun");
  });
});

describe("calendarAlt", () => {
  it("lists the days with their members, 1er without superscript", () => {
    const names = Array.from({ length: 30 }, () => [] as string[]);
    names[0] = ["Camille", "Yanis"];
    names[13] = ["Léa"];
    expect(
      calendarAlt(
        createT("fr", "birthday"),
        "fr",
        { year: 2026, month: 11, day: 1 },
        names
      )
    ).toBe(
      "Les anniversaires de novembre 2026. 1er novembre : Camille et Yanis ; 14 novembre : Léa."
    );
  });
});
