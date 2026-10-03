import { describe, expect, it } from "vitest";
import {
  renderProfile,
  renderServerStats,
  type ProfileImageData,
  type ServerStatsImageData,
} from "./cards.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngSize(png: Buffer) {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const tierCounts = {
  MYTHIC: 1,
  ANOMALY: 20,
  EPIC: 300,
  RARE: 4000,
  UNCOMMON: 50000,
  COMMON: 600000,
  TRASH: 7000000,
};

function profile(serverRank: number): ProfileImageData {
  return {
    username: "virilegamer",
    avatar: null,
    serverRank,
    totalPlayers: 12,
    best: { number: 1234567, score: 98765, tier: "MYTHIC", dateText: "01/02" },
    worst: { number: 42, score: 3, tier: "TRASH", dateText: "02/03" },
    totalRolls: 321,
    averageScore: 4567,
    averageTier: "RARE",
    maxBadges: 4,
    totalScore: 1466007,
    tierCounts,
  };
}

function serverStats(leaders: number): ServerStatsImageData {
  return {
    icon: null,
    best: {
      number: 131081274,
      score: 4200000,
      tier: "MYTHIC",
      playerName: "Alice",
      avatar: null,
    },
    worst: {
      number: 12,
      score: 3,
      tier: "ERROR",
      playerName: "Bob",
      avatar: null,
    },
    totalRolls: 123456,
    averageScore: 98765,
    averageTier: "UNCOMMON",
    overallScore: 123456789,
    tierCounts,
    tierLeaders: Object.fromEntries(
      Object.keys(tierCounts).map((tier) => [tier, Array(leaders).fill(null)])
    ) as ServerStatsImageData["tierLeaders"],
  };
}

describe("renderProfile", () => {
  const labels = {
    bestRoll: "Best Roll",
    worstRoll: "Worst Roll",
    date: (date: string) => `Date : ${date}`,
    totalRolls: "Total Rolls",
    averageScore: "Average Score",
    maxBadges: "Max Badges",
    maxBadgesValue: (count: number) => `${count} badges at once`,
    overallScore: "Overall Score",
    tierBreakdown: "Tier Breakdown",
  };

  it("renders an 800x840 PNG for every kind of rank", async () => {
    const pngs = await Promise.all(
      [0, 1, 2, 3, 7].map((rank) => renderProfile(profile(rank), labels))
    );
    for (const png of pngs) {
      expect(pngSize(png)).toEqual({ width: 800, height: 840 });
    }
    expect(new Set(pngs.map((png) => png.toString("base64"))).size).toBe(5);
  });
});

describe("renderServerStats", () => {
  const labels = {
    title: "RNGdle - Server Stats",
    bestRoll: "Best Roll OAT",
    worstRoll: "Worst Roll OAT",
    by: (name: string) => `by ${name}`,
    totalRolls: "Total Rolls",
    averageScore: "Average Score",
    overallScore: "Overall Score",
    tierBreakdown: "Tier Breakdown",
  };

  it.each([0, 3, 5])("renders an 800x710 PNG with %i leaders", async (n) => {
    const png = await renderServerStats(serverStats(n), labels);
    expect(pngSize(png)).toEqual({ width: 800, height: 710 });
  });
});
