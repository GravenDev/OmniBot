import { describe, expect, it } from "vitest";
import {
  renderProfile,
  type ProfileImageData,
  type ProfileLabels,
} from "./profile-image.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const labels: ProfileLabels = {
  bestRoll: "Best Roll",
  worstRoll: "Worst Roll",
  date: (date) => `Date : ${date}`,
  totalRolls: "Total Rolls",
  averageScore: "Average Score",
  maxBadges: "Max Badges",
  maxBadgesValue: (count) => `${count} badges at once`,
  overallScore: "Overall Score",
  tierBreakdown: "Tier Breakdown",
};

function data(serverRank: number): ProfileImageData {
  return {
    username: "virilegamer",
    avatar: null,
    serverRank,
    totalPlayers: 12,
    best: {
      number: 1234567,
      score: 98765,
      tier: "MYTHIC",
      dateText: "2026-01-02",
    },
    worst: { number: 42, score: 3, tier: "TRASH", dateText: "2026-02-03" },
    totalRolls: 321,
    averageScore: 4567,
    averageTier: "RARE",
    maxBadges: 4,
    totalScore: 1466007,
    tierCounts: {
      MYTHIC: 1,
      ANOMALY: 2,
      EPIC: 3,
      RARE: 4,
      UNCOMMON: 5,
      COMMON: 6,
      TRASH: 7,
    },
  };
}

describe("renderProfile", () => {
  it.each([0, 1, 2, 3, 7])(
    "renders an 800x840 PNG for rank %i",
    async (rank) => {
      const png = await renderProfile(data(rank), labels);
      expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(png.readUInt32BE(16)).toBe(800);
      expect(png.readUInt32BE(20)).toBe(840);
    }
  );

  it("draws a different image depending on the rank", async () => {
    const [none, gold, silver, other] = await Promise.all(
      [0, 1, 2, 7].map((rank) => renderProfile(data(rank), labels))
    );
    expect(none?.equals(gold as Buffer)).toBe(false);
    expect(gold?.equals(silver as Buffer)).toBe(false);
    expect(silver?.equals(other as Buffer)).toBe(false);
  });
});
