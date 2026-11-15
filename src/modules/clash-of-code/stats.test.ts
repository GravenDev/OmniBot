import { describe, expect, it } from "vitest";
import { playerStats, rankByWins } from "./stats.js";

const row = (
  codingamerId: number,
  rank: number,
  score = 100,
  durationMs = 60_000
) => ({
  codingamerId,
  rank,
  score,
  durationMs,
});

describe("rankByWins", () => {
  it("ranks by wins, then by fewer games", () => {
    const standings = rankByWins([
      row(1, 1),
      row(2, 2),
      row(2, 1),
      row(2, 1),
      row(3, 1),
      row(3, 2),
      row(1, 2),
    ]);
    expect(
      standings.map(({ codingamerId, rank, wins, games }) => [
        codingamerId,
        rank,
        wins,
        games,
      ])
    ).toEqual([
      [2, 1, 2, 3],
      [1, 2, 1, 2],
      [3, 2, 1, 2],
    ]);
  });

  it("lets ties share a rank and skips the next one", () => {
    const standings = rankByWins([row(1, 1), row(2, 1), row(3, 2)]);
    expect(standings.map(({ rank }) => rank)).toEqual([1, 1, 3]);
  });

  it("is empty without games", () => {
    expect(rankByWins([])).toEqual([]);
  });
});

describe("playerStats", () => {
  it("averages a player's games", () => {
    expect(
      playerStats([row(1, 1, 100, 60_000), row(1, 3, 50, 120_000)])
    ).toEqual({
      games: 2,
      wins: 1,
      winRate: 0.5,
      averageRank: 2,
      averageScore: 75,
      averageDurationMs: 90_000,
    });
  });

  it("is null without games", () => {
    expect(playerStats([])).toBeNull();
  });
});
