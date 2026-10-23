import { describe, expect, it } from "vitest";
import { renderLeaderboard } from "./leaderboard-image.js";

const labels = {
  locale: "en",
  title: "4h game",
  subtitle: "Points leaderboard",
  rank: "Rank",
  player: "Player",
  score: "Score",
};

describe("renderLeaderboard", () => {
  it("renders a card with the table below the header, one 58px row per player", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      name: i === 1 ? "a".repeat(64) : `player${i}`,
      score: 100 - i,
      avatar: null,
    }));

    const png = await renderLeaderboard({ icon: null, rows }, labels);

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(800);
    // Header (160) + table (52 + 10 × 58 + 12) + bottom margin (30).
    expect(png.readUInt32BE(20)).toBe(160 + 52 + 10 * 58 + 12 + 30);
  });
});
