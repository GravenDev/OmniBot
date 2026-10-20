import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { TIER_COLORS } from "#modules/rngdle/services/scoring.js";
import { movingAverage, movingWindow, renderTrend } from "./trend.js";

const labels = {
  subtitle: "Tendance · 30 derniers jours",
  bestRoll: "Meilleur tirage",
  worstRoll: "Pire tirage",
  roll: (number: string) => `tirage ${number}`,
  averageScore: "Score moyen",
  averageOver: (count: number) => `sur ${count} tirages`,
  change: (percent: number) => `${percent} %`,
  previous: "vs les 30 jours d'avant",
  placement: "Placement moyen",
  placementValue: (percent: number) => `top ${percent}`,
  upperHalf: (count: number, total: number) => `${count}/${total}`,
  tierBreakdown: "Répartition par palier",
  expected: "attendu",
  expectedCount: (value: number) => `/ ${value}`,
  chart: "Placement par tirage",
  midline: "50 %",
  movingAverage: "moyenne glissante sur 7 tirages",
};

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const image = await loadImage(png);
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  return [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)];
}

describe("movingAverage", () => {
  it("averages each value with the ones before it, within the window", () => {
    expect(movingAverage([10, 20, 30, 40], 2)).toEqual([10, 15, 25, 35]);
  });
});

describe("movingWindow", () => {
  it("smooths a year more than a quarter", () => {
    expect(movingWindow(30)).toBe(7);
    expect(movingWindow(90)).toBe(7);
    expect(movingWindow(365)).toBe(30);
  });
});

describe("renderTrend", () => {
  it("draws the summary then one bar per day, in the tier color", async () => {
    const from = new Date(Date.UTC(2026, 8, 20));
    const best = { number: 1, score: 340_195, tier: "MYTHIC", dateText: "" };
    const png = await renderTrend(
      {
        username: "yerminator",
        avatar: null,
        from,
        days: 30,
        months: [{ start: new Date(Date.UTC(2026, 9, 1)), label: "oct." }],
        rolls: [
          {
            rolledAt: new Date(Date.UTC(2026, 9, 4, 10)),
            percent: 99.5,
            tier: "MYTHIC",
          },
        ],
        best: { ...best, tier: "MYTHIC" },
        worst: { ...best, tier: "MYTHIC" },
        averageScore: 340_195,
        averageTier: "MYTHIC",
        averagePercent: 99.5,
        upperHalf: 1,
        change: -20,
        tierCounts: {
          MYTHIC: 1,
          ANOMALY: 0,
          EPIC: 0,
          RARE: 0,
          UNCOMMON: 0,
          COMMON: 0,
          TRASH: 0,
        },
      },
      labels
    );

    expect(png.readUInt32BE(16)).toBe(1000);
    expect(png.readUInt32BE(20)).toBe(160 + 2 * 110 + 20 + 20 + 300 + 30);
    const chartBottom = 160 + 2 * 110 + 20 + 20 + 300 - 44;
    const barX = 60 + (14 + 0.5) * (880 / 30);
    expect(await pixel(png, Math.round(barX), chartBottom - 100)).toEqual([
      ...TIER_COLORS.MYTHIC,
    ]);
  });
});
