import { describe, expect, it } from "vitest";
import {
  renderOverallLeaderboard,
  type OverallLabels,
  type OverallRow,
} from "./overall-leaderboard-image.js";

const labels: OverallLabels = {
  rank: "Rang",
  player: "Pseudo",
  overallScore: "Overall Score",
};

const rows: OverallRow[] = [
  { rank: 1, name: "Alice", avatar: null, totalScore: 999 },
  { rank: 2, name: "Bob", avatar: null, totalScore: 1500 },
  { rank: 3, name: "Carol", avatar: null, totalScore: 2_000_000 },
  {
    rank: 4,
    name: "A very very long player name that must be shrunk to fit",
    avatar: null,
    totalScore: 1_234_567_890,
  },
  { rank: 5, name: "Eve", avatar: null, totalScore: Number.MAX_SAFE_INTEGER },
];

const caller: OverallRow = {
  rank: 14,
  name: "Me",
  avatar: null,
  totalScore: 42,
};

function dimensions(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("renderOverallLeaderboard", () => {
  it("renders a PNG with the expected dimensions", async () => {
    const png = await renderOverallLeaderboard(rows, labels, "fr");
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(dimensions(png)).toEqual({ width: 800, height: 100 + 5 * 90 });
  });

  it("adds room for the caller row", async () => {
    const png = await renderOverallLeaderboard(rows, labels, "en", caller);
    expect(dimensions(png)).toEqual({
      width: 800,
      height: 100 + 5 * 90 + 90 + 20,
    });
  });

  it("renders ranks beyond the podium and an empty page", async () => {
    const paged = rows.map((row, index) => ({ ...row, rank: 11 + index }));
    const png = await renderOverallLeaderboard(paged, labels, "en");
    expect(dimensions(png).height).toBe(100 + 5 * 90);
    const empty = await renderOverallLeaderboard([], labels, "en");
    expect(dimensions(empty).height).toBe(100);
  });

  it("renders a podium caller row", async () => {
    const png = await renderOverallLeaderboard([], labels, "fr", {
      ...caller,
      rank: 2,
    });
    expect(dimensions(png).height).toBe(100 + 90 + 20);
  });
});
