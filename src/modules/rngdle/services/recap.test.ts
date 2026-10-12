import { describe, expect, it } from "vitest";
import type { TFunction } from "#lib/i18n.js";
import {
  buildDailyMessage,
  computeDailyRecap,
  isStreakMilestone,
  MESSAGE_LIMIT,
  type DailyRecap,
} from "./recap.js";
import { ScoreTable } from "./scoring.js";
import type { StoredRoll } from "./store.js";

const table = new ScoreTable({
  "0": 0,
  "100": 10,
  "200": 60,
  "300": 80,
  "400": 92,
  "500": 97,
  "600": 99.5,
});

const DAY = new Date("2026-03-01T00:00:00Z");

function roll(userId: string, score: number, iso: string): StoredRoll {
  return { userId, number: 1, score, badgeCount: 0, rolledAt: new Date(iso) };
}

function daysBefore(userId: string, count: number): StoredRoll[] {
  return Array.from({ length: count }, (_, index) =>
    roll(
      userId,
      150,
      new Date(DAY.getTime() - (index + 1) * 24 * 60 * 60 * 1000).toISOString()
    )
  );
}

const t: TFunction = (key, options) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe("isStreakMilestone", () => {
  it.each([7, 30, 50, 100, 200, 300, 365, 400, 1000])("%i is one", (days) => {
    expect(isStreakMilestone(days)).toBe(true);
  });

  it.each([0, 1, 6, 8, 99, 150, 250, 364, 366, 401])("%i is not", (days) => {
    expect(isStreakMilestone(days)).toBe(false);
  });
});

describe("computeDailyRecap", () => {
  it("returns null when nobody rolled that day", () => {
    expect(
      computeDailyRecap([roll("a", 600, "2026-02-28T10:00:00Z")], DAY, table)
    ).toBeNull();
  });

  it("counts players, finds the rarest and the worst roll of the day only", () => {
    const recap = computeDailyRecap(
      [
        roll("a", 700, "2026-02-28T10:00:00Z"),
        roll("a", 350, "2026-03-01T00:00:00Z"),
        roll("b", 650, "2026-03-01T12:00:00Z"),
        roll("b", 50, "2026-03-01T13:00:00Z"),
        roll("c", 50, "2026-03-01T23:59:59Z"),
        roll("c", 1, "2026-03-02T00:00:00Z"),
      ],
      DAY,
      table
    )!;

    expect(recap.participants).toBe(3);
    expect(recap.rarest).toEqual({
      userId: "b",
      tier: "MYTHIC",
      topPercent: 0.5,
    });
    expect(recap.worst).toEqual({ userId: "b", score: 50 });
  });

  it("leaves the rarest roll out below RARE", () => {
    const recap = computeDailyRecap(
      [
        roll("a", 250, "2026-03-01T10:00:00Z"),
        roll("b", 299, "2026-03-01T10:00:00Z"),
      ],
      DAY,
      table
    )!;

    expect(recap.rarest).toBeNull();
    expect(
      computeDailyRecap([roll("a", 300, "2026-03-01T10:00:00Z")], DAY, table)!
        .rarest
    ).toMatchObject({ tier: "RARE", topPercent: 20 });
  });

  it("leaves the worst roll out when a single player rolled", () => {
    const recap = computeDailyRecap(
      [
        roll("a", 600, "2026-03-01T10:00:00Z"),
        roll("a", 10, "2026-03-01T11:00:00Z"),
      ],
      DAY,
      table
    )!;

    expect(recap.participants).toBe(1);
    expect(recap.worst).toBeNull();
  });

  it("leaves the worst roll out when it ties with the best one", () => {
    const recap = computeDailyRecap(
      [
        roll("a", 250, "2026-03-01T10:00:00Z"),
        roll("b", 250, "2026-03-01T11:00:00Z"),
      ],
      DAY,
      table
    )!;

    expect(recap.participants).toBe(2);
    expect(recap.worst).toBeNull();
  });

  it("lists the players whose streak reaches a milestone that day, longest first", () => {
    const recap = computeDailyRecap(
      [
        ...daysBefore("seven", 6),
        roll("seven", 100, "2026-03-01T10:00:00Z"),
        ...daysBefore("thirty", 29),
        roll("thirty", 100, "2026-03-01T10:00:00Z"),
        ...daysBefore("eight", 7),
        roll("eight", 100, "2026-03-01T10:00:00Z"),
        ...daysBefore("absent", 7),
        roll("seven", 100, "2026-03-02T01:00:00Z"),
      ],
      DAY,
      table
    )!;

    expect(recap.streaks).toEqual([
      { userId: "thirty", days: 30 },
      { userId: "seven", days: 7 },
    ]);
  });
});

describe("buildDailyMessage", () => {
  const full: DailyRecap = {
    participants: 12,
    rarest: { userId: "r", tier: "MYTHIC", topPercent: 0.5 },
    worst: { userId: "w", score: 1234 },
    streaks: [{ userId: "s", days: 30 }],
  };

  it("keeps the congratulations line alone without a recap", () => {
    expect(buildDailyMessage(["a", "b"], null, t, "fr")).toBe(
      'daily.message {"winners":"<@a> <@b>"}'
    );
  });

  it("puts every line in order, with mentions and localized numbers", () => {
    expect(buildDailyMessage(["a"], full, t, "fr").split("\n")).toEqual([
      'daily.message {"winners":"<@a>"}',
      'daily.participants {"count":12}',
      'daily.rarest {"user":"<@r>","tier":"MYTHIC","percent":"0,5"}',
      'daily.worst {"user":"<@w>","score":"1 234","count":1234}',
      'daily.streak {"user":"<@s>","count":30}',
    ]);
  });

  it("skips the missing parts", () => {
    const message = buildDailyMessage(
      ["a"],
      { participants: 1, rarest: null, worst: null, streaks: [] },
      t,
      "en"
    );

    expect(message.split("\n")).toEqual([
      'daily.message {"winners":"<@a>"}',
      'daily.participants {"count":1}',
    ]);
  });

  it("stays under the Discord limit by summing up the streaks that do not fit", () => {
    const streaks = Array.from({ length: 200 }, (_, index) => ({
      userId: `${10n ** 18n + BigInt(index)}`,
      days: 7,
    }));

    const message = buildDailyMessage(["a"], { ...full, streaks }, t, "en");
    const lines = message.split("\n");

    expect(message.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
    const shown = lines.filter((line) => line.startsWith("daily.streak "));
    expect(shown.length).toBeGreaterThan(0);
    expect(lines.at(-1)).toBe(
      `daily.moreStreaks {"count":${streaks.length - shown.length}}`
    );
  });

  it("always keeps room for the summary line, whatever fills the message", () => {
    for (let winners = 1; winners <= 40; winners++) {
      const streaks = Array.from({ length: 120 }, (_, index) => ({
        userId: `${10n ** 17n + BigInt(index)}`,
        days: 7,
      }));
      const winnerIds = Array.from({ length: winners }, (_, i) => `${i}`);

      const message = buildDailyMessage(
        winnerIds,
        { ...full, streaks },
        t,
        "en"
      );
      const lines = message.split("\n");
      const shown = lines.filter((line) => line.startsWith("daily.streak "));

      expect(message.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
      expect(lines.at(-1)).toBe(
        `daily.moreStreaks {"count":${streaks.length - shown.length}}`
      );
    }
  });
});
