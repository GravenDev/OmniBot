import { describe, expect, it } from "vitest";
import { ScoreTable } from "./scoring.js";
import { computeRollStats, computeServerStats } from "./stats.js";
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
