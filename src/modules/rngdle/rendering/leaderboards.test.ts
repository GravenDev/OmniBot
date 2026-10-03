import { describe, expect, it } from "vitest";
import {
  renderDailyLeaderboard,
  renderOverallLeaderboard,
  type DailyLeaderboardRow,
  type OverallRow,
} from "./leaderboards.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngSize(png: Buffer) {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const LONG_NAME = "A very very long player name that must be shrunk to fit";

describe("renderDailyLeaderboard", () => {
  it("renders a 1010px wide PNG with one 90px row per player", async () => {
    const rows: DailyLeaderboardRow[] = (
      ["MYTHIC", "EPIC", "COMMON", "ERROR"] as const
    ).map((tier, index) => ({
      rank: index + 1,
      name: index === 1 ? LONG_NAME : `Player ${index}`,
      avatar: null,
      number: 1234567 * index,
      score: 999_999 * index,
      percent: 99.9 - index * 30,
      tier,
    }));
    const png = await renderDailyLeaderboard(rows, {
      rank: "Rang",
      player: "Pseudo",
      number: "Tirage",
      score: "Score",
      placement: "Placement",
    });
    expect(pngSize(png)).toEqual({ width: 1010, height: 100 + 4 * 90 });
  });
});

describe("renderOverallLeaderboard", () => {
  const labels = { rank: "Rang", player: "Pseudo", overallScore: "Score" };
  const rows: OverallRow[] = [999, 1_500, 2_000_000, 1_234_567_890].map(
    (totalScore, index) => ({
      rank: index + 1,
      name: index === 3 ? LONG_NAME : `Player ${index}`,
      avatar: null,
      totalScore,
    })
  );
  const caller: OverallRow = {
    rank: 14,
    name: "Me",
    avatar: null,
    totalScore: 42,
  };

  it.each([
    ["without caller", rows, undefined, 100 + 4 * 90],
    ["with a caller row", rows, caller, 100 + 5 * 90 + 20],
    ["for an empty page", [], undefined, 100],
    ["for a podium caller alone", [], { ...caller, rank: 2 }, 100 + 90 + 20],
  ])("renders %s", async (_, page, extra, height) => {
    const png = await renderOverallLeaderboard(page, labels, "fr", extra);
    expect(pngSize(png)).toEqual({ width: 800, height });
  });
});
