import { describe, expect, it } from "vitest";
import {
  renderDailyLeaderboard,
  type DailyLeaderboardLabels,
  type DailyLeaderboardRow,
} from "./daily-leaderboard-image.js";

const labels: DailyLeaderboardLabels = {
  rank: "Rang",
  player: "Pseudo",
  number: "Tirage",
  score: "Score",
  placement: "Placement",
};

const rows: DailyLeaderboardRow[] = [
  {
    rank: 1,
    name: "Alice",
    avatar: null,
    number: 131081274,
    score: 131081274,
    percent: 99.9,
    tier: "MYTHIC",
  },
  {
    rank: 2,
    name: "A very very long player name that must be shrunk",
    avatar: null,
    number: 1234567,
    score: 2000000,
    percent: 80,
    tier: "EPIC",
  },
  {
    rank: 3,
    name: "Carol",
    avatar: null,
    number: 42,
    score: 9000,
    percent: 40,
    tier: "COMMON",
  },
  {
    rank: 4,
    name: "Dave",
    avatar: null,
    number: 7,
    score: 50,
    percent: 2,
    tier: "ERROR",
  },
];

describe("renderDailyLeaderboard", () => {
  it("renders a PNG with the expected dimensions", async () => {
    const png = await renderDailyLeaderboard(rows, labels);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(png.readUInt32BE(16)).toBe(1010);
    expect(png.readUInt32BE(20)).toBe(100 + rows.length * 90);
  });
});
