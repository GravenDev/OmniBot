import { describe, expect, it } from "vitest";
import { renderLeaderboard } from "./leaderboard-image.js";

const headers = { rank: "Rank", player: "Player", score: "Score" };

function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("renderLeaderboard", () => {
  it("renders a PNG with one header and one 90px row per player", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      name: i === 1 ? "a".repeat(64) : `player${i}`,
      score: 100 - i,
      avatar: null,
    }));

    const png = await renderLeaderboard(rows, headers);

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(pngSize(png)).toEqual({ width: 800, height: 100 + 10 * 90 });
  });
});
