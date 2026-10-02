import { describe, expect, it } from "vitest";
import type { Tier } from "../services/score-table.js";
import {
  renderServerStats,
  type ServerStatsImageData,
  type ServerStatsLabels,
} from "./server-stats-image.js";

const labels: ServerStatsLabels = {
  title: "RNGdle - Server Stats",
  bestRoll: "Best Roll OAT",
  worstRoll: "Worst Roll OAT",
  by: (name) => `by ${name}`,
  totalRolls: "Total Rolls",
  averageScore: "Average Score",
  overallScore: "Overall Score",
  tierBreakdown: "Tier Breakdown",
};

function buildData(leaders: Record<Tier, number>): ServerStatsImageData {
  const tierLeaders = Object.fromEntries(
    Object.entries(leaders).map(([tier, count]) => [
      tier,
      Array.from({ length: count }, () => null),
    ])
  ) as ServerStatsImageData["tierLeaders"];
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
      tier: "TRASH",
      playerName: "Bob",
      avatar: null,
    },
    totalRolls: 123456,
    averageScore: 98765,
    averageTier: "UNCOMMON",
    overallScore: 123456789,
    tierCounts: {
      MYTHIC: 1,
      ANOMALY: 20,
      EPIC: 300,
      RARE: 4000,
      UNCOMMON: 50000,
      COMMON: 600000,
      TRASH: 7000000,
    },
    tierLeaders,
  };
}

function expectPng(png: Buffer): void {
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  expect(png.readUInt32BE(16)).toBe(800);
  expect(png.readUInt32BE(20)).toBe(710);
}

describe("renderServerStats", () => {
  it("renders a PNG with no tier leaders", async () => {
    const png = await renderServerStats(
      buildData({
        MYTHIC: 0,
        ANOMALY: 0,
        EPIC: 0,
        RARE: 0,
        UNCOMMON: 0,
        COMMON: 0,
        TRASH: 0,
      }),
      labels
    );
    expectPng(png);
  });

  it("renders a PNG with one leader per tier", async () => {
    const png = await renderServerStats(
      buildData({
        MYTHIC: 1,
        ANOMALY: 1,
        EPIC: 1,
        RARE: 1,
        UNCOMMON: 1,
        COMMON: 1,
        TRASH: 1,
      }),
      labels
    );
    expectPng(png);
  });

  it("renders a PNG with three leaders per tier and null images", async () => {
    const png = await renderServerStats(
      buildData({
        MYTHIC: 3,
        ANOMALY: 3,
        EPIC: 3,
        RARE: 3,
        UNCOMMON: 3,
        COMMON: 3,
        TRASH: 3,
      }),
      labels
    );
    expectPng(png);
  });
});
