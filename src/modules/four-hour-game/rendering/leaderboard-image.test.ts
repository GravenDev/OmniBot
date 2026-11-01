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

  it("adds the caller's row under the table when they are not on it", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      name: `player${i}`,
      score: 100 - i,
      avatar: null,
    }));
    const caller = { rank: 17, name: "me", score: 3, avatar: null };

    const onPage = await renderLeaderboard(
      { icon: null, rows, callerRank: 2 },
      labels
    );
    const below = await renderLeaderboard(
      { icon: null, rows, callerRank: 17, caller },
      labels
    );

    // Highlighting a row on the card does not change its size; the row
    // under the table adds a gap and one row.
    expect(onPage.readUInt32BE(20)).toBe(160 + 52 + 10 * 58 + 12 + 30);
    expect(below.readUInt32BE(20)).toBeGreaterThan(
      onPage.readUInt32BE(20) + 58
    );
  });
});
