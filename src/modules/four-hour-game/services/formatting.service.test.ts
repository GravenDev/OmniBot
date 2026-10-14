import { beforeAll, describe, expect, it } from "vitest";
import { createT } from "#lib/i18n.js";
import { initTestI18n } from "#lib/testing.js";
import en from "#modules/four-hour-game/i18n/en.json" with { type: "json" };
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };
import formatting from "./formatting.service.js";

const NAMESPACE = "four-hour-game";
const frT = createT("fr", NAMESPACE);
const enT = createT("en", NAMESPACE);

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeAll(async () => {
  await initTestI18n(NAMESPACE, { en, fr });
});

describe("formatHeldTime", () => {
  it.each([
    [4 * HOUR + 12 * MINUTE + 30, "4 h 12 min", "4h 12m"],
    [3 * DAY + 2 * HOUR + 59 * MINUTE, "3 j 2 h", "3d 2h"],
    [45 * MINUTE, "45 min", "45m"],
    [45 * MINUTE + 10, "45 min 10 s", "45m 10s"],
    [30, "30 s", "30s"],
    [4 * HOUR, "4 h", "4h"],
    [2 * DAY + 5 * MINUTE, "2 j", "2d"],
    [0, "0 s", "0s"],
  ])("formats %d seconds", (seconds, french, english) => {
    expect(formatting.formatHeldTime(seconds, frT)).toBe(french);
    expect(formatting.formatHeldTime(seconds, enT)).toBe(english);
  });

  it("treats negative or invalid values as zero", () => {
    expect(formatting.formatHeldTime(-5, enT)).toBe("0s");
    expect(formatting.formatHeldTime(Number.NaN, enT)).toBe("0s");
  });
});

describe("formatRank", () => {
  it.each([
    [1, "1ᵉʳ sur 17"],
    [2, "2ᵉ sur 17"],
    [3, "3ᵉ sur 17"],
    [11, "11ᵉ sur 17"],
  ])("formats rank %d in French", (rank, expected) => {
    expect(formatting.formatRank({ rank, total: 17 }, frT)).toBe(expected);
  });

  it.each([
    [1, "1st of 120"],
    [2, "2nd of 120"],
    [3, "3rd of 120"],
    [4, "4th of 120"],
    [11, "11th of 120"],
    [12, "12th of 120"],
    [13, "13th of 120"],
    [21, "21st of 120"],
    [22, "22nd of 120"],
    [103, "103rd of 120"],
  ])("formats rank %d in English", (rank, expected) => {
    expect(formatting.formatRank({ rank, total: 120 }, enT)).toBe(expected);
  });
});
