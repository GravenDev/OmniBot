import { describe, expect, it } from "vitest";
import { ScoreTable } from "./scoring.js";
import {
  byBestRoll,
  computeRanking,
  computeRollStats,
  computeServerStats,
  computeStreaks,
  rankingIndex,
} from "./stats.js";
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

let counter = 0;
function roll(userId: string, score: number, badgeCount = 0): StoredRoll {
  const number = ++counter;
  return {
    userId,
    number,
    score,
    badgeCount,
    rolledAt: new Date(Date.UTC(2026, 0, number)),
  };
}

describe("computeRollStats", () => {
  it("returns null without rolls", () => {
    expect(computeRollStats([], table)).toBeNull();
  });

  it("computes totals, truncated average, extremes (first on ties) and max badges", () => {
    const rolls = [
      roll("a", 100, 1),
      roll("b", 601, 5),
      roll("a", 50, 3),
      roll("c", 10, 0),
      roll("d", 601, 0),
      roll("e", 10, 0),
    ];

    const stats = computeRollStats(rolls, table)!;

    expect(stats).toMatchObject({
      totalRolls: 6,
      totalScore: 1372,
      averageScore: 228,
      maxBadges: 5,
    });
    expect(stats.best).toEqual({
      userId: "b",
      number: rolls[1]!.number,
      score: 601,
      rolledAt: rolls[1]!.rolledAt,
    });
    expect(stats.worst.userId).toBe("c");
  });

  it("counts every tier, with zeros, and leaves ERROR rolls out of the tiers", () => {
    const scores = [0, 5, 100, 250, 350, 450, 550, 650, 700, -1];

    const stats = computeRollStats(
      scores.map((score) => roll("a", score)),
      table
    )!;

    expect(stats.totalRolls).toBe(10);
    expect(stats.tierCounts).toEqual({
      TRASH: 2,
      COMMON: 1,
      UNCOMMON: 1,
      RARE: 1,
      EPIC: 1,
      ANOMALY: 1,
      MYTHIC: 2,
    });
  });
});

describe("computeServerStats", () => {
  it("returns null without rolls", () => {
    expect(computeServerStats([], table)).toBeNull();
  });

  it("includes the roll stats and orders tier leaders by count, at most 3, skipping ERROR rolls", () => {
    const rolls = [
      roll("a", 100),
      roll("b", 100),
      roll("b", 100),
      roll("c", 100),
      roll("c", 100),
      roll("c", 100),
      roll("d", 100),
      roll("a", 650),
      roll("z", -10),
    ];

    const stats = computeServerStats(rolls, table)!;

    expect(stats.totalRolls).toBe(9);
    expect(stats.tierLeaders.COMMON).toEqual(["c", "b", "a"]);
    expect(stats.tierLeaders.MYTHIC).toEqual(["a"]);
    expect(stats.tierLeaders.TRASH).toEqual([]);
    expect(Object.values(stats.tierLeaders).flat()).not.toContain("z");
  });
});

describe("computeStreaks", () => {
  const at = (iso: string) => ({ rolledAt: new Date(iso) });
  const now = new Date("2026-03-02T12:00:00Z");

  it("is empty without rolls", () => {
    expect(computeStreaks([], now)).toEqual({ current: 0, best: 0 });
  });

  it("counts a streak ending today", () => {
    const rolls = [
      at("2026-02-28T23:59:59Z"),
      at("2026-03-01T00:00:00Z"),
      at("2026-03-02T08:00:00Z"),
    ];

    expect(computeStreaks(rolls, now)).toEqual({ current: 3, best: 3 });
  });

  it("keeps a streak ending yesterday, since today's roll may still come", () => {
    const rolls = [at("2026-02-28T10:00:00Z"), at("2026-03-01T10:00:00Z")];

    expect(computeStreaks(rolls, now)).toEqual({ current: 2, best: 2 });
  });

  it("drops the current streak after a missed day but keeps the record", () => {
    const rolls = [
      at("2026-02-25T10:00:00Z"),
      at("2026-02-26T10:00:00Z"),
      at("2026-02-27T10:00:00Z"),
    ];

    expect(computeStreaks(rolls, now)).toEqual({ current: 0, best: 3 });
  });

  it("restarts after a one-day gap", () => {
    const rolls = [
      at("2026-02-26T10:00:00Z"),
      at("2026-02-27T10:00:00Z"),
      at("2026-03-01T10:00:00Z"),
      at("2026-03-02T10:00:00Z"),
    ];

    expect(computeStreaks(rolls, now)).toEqual({ current: 2, best: 2 });
  });

  it("counts several rolls of the same UTC day once, in any order", () => {
    const rolls = [
      at("2026-03-02T09:00:00Z"),
      at("2026-03-01T23:00:00Z"),
      at("2026-03-01T01:00:00Z"),
      at("2026-03-02T00:30:00Z"),
    ];

    expect(computeStreaks(rolls, now)).toEqual({ current: 2, best: 2 });
  });

  it("chains days across a month boundary", () => {
    const rolls = [at("2026-01-31T10:00:00Z"), at("2026-02-01T10:00:00Z")];

    expect(computeStreaks(rolls, new Date("2026-02-01T18:00:00Z"))).toEqual({
      current: 2,
      best: 2,
    });
  });
});

describe("rankingIndex", () => {
  it("follows the total for newcomers and the average for regulars", () => {
    expect(rankingIndex(400, 2, 20)).toBeCloseTo(400 / 22);
    expect(rankingIndex(200 * 1000, 1000, 20)).toBeCloseTo(196.08, 1);
  });

  it("grows smoothly with each roll at a steady average", () => {
    const indexes = [1, 2, 5, 20, 100].map((rolls) =>
      rankingIndex(100 * rolls, rolls, 20)
    );

    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(indexes.at(-1)).toBeLessThan(100);
  });
});

describe("computeRanking", () => {
  it("returns nothing without rolls", () => {
    expect(computeRanking([])).toEqual([]);
  });

  it("ranks a regular with a steady average above a newcomer with a better one", () => {
    const regular = Array.from({ length: 60 }, () => roll("regular", 300));
    const newcomer = [roll("newcomer", 500), roll("newcomer", 500)];

    const ranking = computeRanking([...newcomer, ...regular]);

    expect(ranking.map((entry) => entry.userId)).toEqual([
      "regular",
      "newcomer",
    ]);
    expect(ranking[0]).toMatchObject({ rolls: 60, total: 18_000 });
    expect(ranking[0]!.index).toBeCloseTo(18_000 / 80);
  });

  it("keeps the first best roll of each player and breaks ties by total then id", () => {
    const first = roll("b", 300);
    const ranking = computeRanking(
      [roll("a", 100), roll("a", 200), first, roll("b", 300), roll("c", 300)],
      0
    );

    expect(ranking.map((entry) => entry.userId)).toEqual(["b", "c", "a"]);
    expect(ranking[0]!.best.number).toBe(first.number);
  });
});

describe("byBestRoll", () => {
  it("orders players by their best roll, the earliest first on ties", () => {
    const early = roll("late-id", 500);
    const ranking = computeRanking([
      roll("steady", 300),
      roll("steady", 300),
      early,
      roll("early-id", 500),
      roll("low", 100),
    ]);

    expect(byBestRoll(ranking).map((entry) => entry.userId)).toEqual([
      "late-id",
      "early-id",
      "steady",
      "low",
    ]);
  });
});
