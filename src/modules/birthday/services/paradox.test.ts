import { describe, expect, it } from "vitest";
import {
  CERTAIN_GROUP_SIZE,
  collisionProbability,
  expectedFirstCollision,
  HALF_GROUP_SIZE,
  newMilestones,
  sharedDates,
} from "./paradox.js";

describe("collisionProbability", () => {
  it("matches the textbook values", () => {
    expect(collisionProbability(0)).toBe(0);
    expect(collisionProbability(1)).toBe(0);
    expect(collisionProbability(23)).toBeCloseTo(0.5073, 4);
    expect(collisionProbability(57)).toBeCloseTo(0.9901, 4);
    expect(collisionProbability(366)).toBe(1);
  });
});

describe("milestone sizes", () => {
  it("are 23 and 57", () => {
    expect(HALF_GROUP_SIZE).toBe(23);
    expect(CERTAIN_GROUP_SIZE).toBe(57);
  });

  it("expects the first collision around 24.6", () => {
    expect(expectedFirstCollision()).toBeCloseTo(24.617, 2);
  });
});

describe("sharedDates", () => {
  it("groups dates held by two members or more, in calendar order", () => {
    const entries = [
      { userId: "a", day: 2, month: 11 },
      { userId: "b", day: 14, month: 3 },
      { userId: "c", day: 2, month: 11 },
      { userId: "d", day: 14, month: 3 },
      { userId: "e", day: 14, month: 3 },
      { userId: "f", day: 1, month: 1 },
    ];
    expect(
      sharedDates(entries).map((date) => [
        date.month,
        date.day,
        date.entries.map((entry) => entry.userId),
      ])
    ).toEqual([
      [3, 14, ["b", "d", "e"]],
      [11, 2, ["a", "c"]],
    ]);
  });
});

describe("newMilestones", () => {
  it("returns the milestones reached and not announced yet", () => {
    expect(newMilestones(22, false, [])).toEqual([]);
    expect(newMilestones(23, false, [])).toEqual(["half"]);
    expect(newMilestones(23, true, ["half"])).toEqual(["first-collision"]);
    expect(newMilestones(60, true, ["half", "first-collision"])).toEqual([
      "certain",
    ]);
    expect(
      newMilestones(60, true, ["half", "first-collision", "certain"])
    ).toEqual([]);
  });
});
