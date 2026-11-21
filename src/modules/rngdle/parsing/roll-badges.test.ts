import { describe, expect, it } from "vitest";
import { parseRollBadges } from "./roll-badges.js";

const BADGE = {
  id: "CONTIGUOUS_BOAT",
  label: "Contiguous Full House",
  emoji: "🏰",
  ep: 30111,
  rarity: "Rare",
  prob: 0.3321,
};

function body(number: number) {
  return { number, totalEP: 41731, count: 1, badges: [BADGE] };
}

describe("parseRollBadges", () => {
  it("reads the badges of a number", () => {
    expect(parseRollBadges(111883, body(111883))).toEqual({
      number: 111883,
      score: 41731,
      badges: [
        {
          id: "CONTIGUOUS_BOAT",
          label: "Contiguous Full House",
          emoji: "🏰",
          ep: 30111,
          rarity: "Rare",
          probability: 0.3321,
        },
      ],
    });
  });

  it("refuses the answer for another number", () => {
    expect(parseRollBadges(111884, body(111883))).toBeNull();
  });

  it("refuses a malformed badge", () => {
    expect(
      parseRollBadges(111883, { ...body(111883), badges: [{ id: "X" }] })
    ).toBeNull();
  });
});
