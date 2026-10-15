import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { TIER_COLORS } from "#modules/rngdle/services/scoring.js";
import { renderHistory, type HistoryRow } from "./history.js";

const labels = {
  subtitle: (count: number) => `Historique · ${count} derniers tirages`,
  averageScore: "Score moyen",
  averageTier: (tier: string) => `${tier} en moyenne`,
  placement: "Placement moyen",
  placementValue: (percent: number) => `top ${percent}`,
  upperHalf: (count: number, total: number) => `${count} sur ${total}`,
  streak: "Série en cours",
  streakValue: (count: number) => `${count} jours`,
  streakRecord: (count: number) => `record : ${count}`,
  date: "Date",
  number: "Tirage",
  score: "Score",
  placementHeader: "Placement",
};

const row = (score: number, tier: HistoryRow["tier"]): HistoryRow => ({
  dateText: "mar. 14 oct.",
  today: false,
  number: 1234567,
  score,
  percent: 60,
  tier,
});

function render(rows: HistoryRow[]) {
  return renderHistory(
    {
      username: "Kalimba",
      avatar: null,
      rows,
      averageScore: 1_376_430,
      averageTier: "UNCOMMON",
      averagePercent: 57.6,
      upperHalf: 5,
      currentStreak: 10,
      bestStreak: 23,
    },
    labels
  );
}

async function edgePixel(png: Buffer, top: number): Promise<number[]> {
  const image = await loadImage(png);
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  return [...ctx.getImageData(42, top, 1, 1).data.subarray(0, 3)];
}

describe("renderHistory", () => {
  it("renders the summary then one 58px row per roll, 1000px wide", async () => {
    const png = await render(
      Array.from({ length: 10 }, (_, index) => row(index, "COMMON"))
    );

    expect(png.readUInt32BE(16)).toBe(1000);
    expect(png.readUInt32BE(20)).toBe(160 + 110 + 20 + 52 + 10 * 58 + 12 + 30);
  });

  it("marks the best roll of the list with the edge of its tier color", async () => {
    const tableRows = 160 + 110 + 20 + 52;
    const png = await render([
      row(10, "COMMON"),
      row(900, "EPIC"),
      row(5, "TRASH"),
    ]);

    expect(await edgePixel(png, tableRows + 58 + 29)).toEqual([
      ...TIER_COLORS.EPIC,
    ]);
    expect(await edgePixel(png, tableRows + 29)).not.toEqual([
      ...TIER_COLORS.COMMON,
    ]);
  });
});
