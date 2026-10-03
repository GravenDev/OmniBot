import { describe, expect, it } from "vitest";
import { renderLeaderboard } from "./leaderboard-image.js";

describe("renderLeaderboard", () => {
  it("renders a PNG with one header and one 90px row per player", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      name: i === 1 ? "a".repeat(64) : `player${i}`,
      score: 100 - i,
      avatar: null,
    }));

    const png = await renderLeaderboard(rows, {
      rank: "Rank",
      player: "Player",
      score: "Score",
    });

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(800);
    expect(png.readUInt32BE(20)).toBe(100 + 10 * 90);
  });
});
