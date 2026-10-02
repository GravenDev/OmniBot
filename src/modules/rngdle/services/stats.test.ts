import { describe, expect, it } from "vitest";
import type { StoredRoll } from "./rngdle.service.js";
import { ScoreTable } from "./score-table.js";
import { computeRollStats, computeServerStats } from "./stats.js";

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
function roll(
  userId: string,
  score: number,
  badgeCount = 0,
  number = ++counter
): StoredRoll {
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

  it("aggregates a single roll", () => {
    const only = roll("a", 250, 2, 7);

    const stats = computeRollStats([only], table)!;

    expect(stats.totalRolls).toBe(1);
    expect(stats.totalScore).toBe(250);
    expect(stats.averageScore).toBe(250);
    expect(stats.best).toEqual({
      userId: "a",
      number: 7,
      score: 250,
      rolledAt: only.rolledAt,
    });
    expect(stats.worst).toEqual(stats.best);
    expect(stats.maxBadges).toBe(2);
  });

  it("computes totals, truncated average, extremes and max badges", () => {
    const rolls = [
      roll("a", 100, 1),
      roll("b", 601, 5),
      roll("a", 50, 3),
      roll("c", 10, 0),
    ];

    const stats = computeRollStats(rolls, table)!;

    expect(stats.totalRolls).toBe(4);
    expect(stats.totalScore).toBe(761);
    expect(stats.averageScore).toBe(190);
    expect(stats.best.score).toBe(601);
    expect(stats.best.userId).toBe("b");
    expect(stats.worst.score).toBe(10);
    expect(stats.worst.userId).toBe("c");
    expect(stats.maxBadges).toBe(5);
  });

  it("picks the first occurrence on ties", () => {
    const rolls = [
      roll("a", 300, 0, 1),
      roll("b", 300, 0, 2),
      roll("c", 300, 0, 3),
    ];

    const stats = computeRollStats(rolls, table)!;

    expect(stats.best.userId).toBe("a");
    expect(stats.worst.userId).toBe("a");
  });

  it("counts tiers and excludes ERROR rolls", () => {
    const rolls = [
      roll("a", 0),
      roll("a", 5),
      roll("a", 100),
      roll("a", 250),
      roll("a", 350),
      roll("a", 450),
      roll("a", 550),
      roll("a", 650),
      roll("a", 700),
      roll("a", -1),
    ];

    const stats = computeRollStats(rolls, table)!;

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

  it("reports every tier with a zero count when nothing matches", () => {
    const stats = computeRollStats([roll("a", 100)], table)!;

    expect(stats.tierCounts).toEqual({
      TRASH: 0,
      COMMON: 1,
      UNCOMMON: 0,
      RARE: 0,
      EPIC: 0,
      ANOMALY: 0,
      MYTHIC: 0,
    });
  });
});

describe("computeServerStats", () => {
  it("returns null without rolls", () => {
    expect(computeServerStats([], table)).toBeNull();
  });

  it("includes the roll stats", () => {
    const stats = computeServerStats([roll("a", 100), roll("b", 300)], table)!;

    expect(stats.totalRolls).toBe(2);
    expect(stats.best.userId).toBe("b");
  });

  it("orders tier leaders by count and gives [] to empty tiers", () => {
    const rolls = [
      roll("a", 100),
      roll("b", 110),
      roll("b", 120),
      roll("c", 130),
      roll("c", 140),
      roll("c", 150),
      roll("a", 650),
    ];

    const { tierLeaders } = computeServerStats(rolls, table)!;

    expect(tierLeaders.COMMON).toEqual(["c", "b", "a"]);
    expect(tierLeaders.MYTHIC).toEqual(["a"]);
    expect(tierLeaders.TRASH).toEqual([]);
    expect(tierLeaders.UNCOMMON).toEqual([]);
    expect(tierLeaders.RARE).toEqual([]);
    expect(tierLeaders.EPIC).toEqual([]);
    expect(tierLeaders.ANOMALY).toEqual([]);
  });

  it("keeps at most 3 leaders per tier", () => {
    const rolls = [
      roll("a", 100),
      roll("a", 100),
      roll("a", 100),
      roll("a", 100),
      roll("b", 100),
      roll("b", 100),
      roll("b", 100),
      roll("c", 100),
      roll("c", 100),
      roll("d", 100),
      roll("e", 100),
    ];

    const { tierLeaders } = computeServerStats(rolls, table)!;

    expect(tierLeaders.COMMON).toEqual(["a", "b", "c"]);
  });

  it("ignores ERROR rolls for leaders", () => {
    const { tierLeaders } = computeServerStats(
      [roll("a", -10), roll("b", 100)],
      table
    )!;

    expect(Object.values(tierLeaders).flat()).toEqual(["b"]);
  });
});
