import { describe, expect, it } from "vitest";
import type { StoredRoll } from "./store.service.js";
import versus from "./versus.service.js";

function roll(
  userId: string,
  day: number,
  score: number,
  options: { hour?: number; badgeCount?: number; number?: number } = {}
): StoredRoll {
  return {
    userId,
    number: options.number ?? score * 10,
    score,
    badgeCount: options.badgeCount ?? 0,
    rolledAt: new Date(Date.UTC(2026, 0, day, options.hour ?? 12)),
  };
}

describe("compare", () => {
  it("names the higher side, or a tie", () => {
    expect(versus.compare(5, 3)).toBe("left");
    expect(versus.compare(3, 5)).toBe("right");
    expect(versus.compare(4, 4)).toBe("tie");
  });

  it("gives the line to the only side that has a value", () => {
    expect(versus.compare(0, null)).toBe("left");
    expect(versus.compare(null, 0)).toBe("right");
    expect(versus.compare(null, null)).toBeNull();
  });
});

describe("computeHeadToHead", () => {
  it("only counts the UTC days both players rolled", () => {
    const duel = versus.computeHeadToHead(
      [roll("a", 1, 50), roll("a", 2, 10), roll("a", 3, 30), roll("a", 4, 99)],
      [roll("b", 1, 40), roll("b", 2, 20), roll("b", 3, 30), roll("b", 5, 1)]
    );

    expect(duel).toEqual({ days: 3, left: 1, right: 1, ties: 1 });
  });

  it("uses UTC days, not 24-hour windows", () => {
    const duel = versus.computeHeadToHead(
      [roll("a", 1, 50, { hour: 23 })],
      [roll("b", 2, 40, { hour: 0 })]
    );

    expect(duel).toEqual({ days: 0, left: 0, right: 0, ties: 0 });
  });

  it("keeps each player's best roll of a day", () => {
    const duel = versus.computeHeadToHead(
      [roll("a", 1, 90, { hour: 1 }), roll("a", 1, 10, { hour: 20 })],
      [roll("b", 1, 50)]
    );

    expect(duel).toEqual({ days: 1, left: 1, right: 0, ties: 0 });
  });
});

describe("computeVersus", () => {
  it("returns null when neither player has a roll", () => {
    expect(versus.computeVersus([], [])).toBeNull();
  });

  it("summarizes both players and picks the winner of every line", () => {
    const match = versus.computeVersus(
      [
        roll("a", 1, 100, { badgeCount: 2, number: 7 }),
        roll("a", 2, 51, { badgeCount: 5 }),
      ],
      [
        roll("b", 1, 120, { badgeCount: 5, number: 9 }),
        roll("b", 2, 10),
        roll("b", 3, 5),
      ]
    );

    expect(match?.left).toEqual({
      totalScore: 151,
      totalRolls: 2,
      averageScore: 75,
      best: { number: 7, score: 100 },
      maxBadges: 5,
    });
    expect(match?.right).toEqual({
      totalScore: 135,
      totalRolls: 3,
      averageScore: 45,
      best: { number: 9, score: 120 },
      maxBadges: 5,
    });
    expect(match?.headToHead).toEqual({ days: 2, left: 1, right: 1, ties: 0 });
    expect(match?.winners).toEqual({
      totalScore: "left",
      totalRolls: "right",
      averageScore: "left",
      bestRoll: "right",
      maxBadges: "tie",
      headToHead: "tie",
    });
  });

  it("gives every line to the only player who rolled", () => {
    const match = versus.computeVersus([], [roll("b", 1, 0)]);

    expect(match?.left).toEqual({
      totalScore: 0,
      totalRolls: 0,
      averageScore: null,
      best: null,
      maxBadges: null,
    });
    expect(match?.winners).toEqual({
      totalScore: "tie",
      totalRolls: "right",
      averageScore: "right",
      bestRoll: "right",
      maxBadges: "right",
      headToHead: null,
    });
  });
});
