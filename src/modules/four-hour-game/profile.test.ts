import { describe, expect, it } from "vitest";
import { computeProfileStats, type AwardedPoint } from "./profile.js";

const now = new Date("2026-10-12T12:00:00Z");

function history(
  ...entries: [userId: string, iso: string, heldSeconds?: number][]
): AwardedPoint[] {
  return entries.map(([userId, iso, heldSeconds = 14_400]) => ({
    userId,
    heldSeconds,
    awardedAt: new Date(iso),
  }));
}

describe("computeProfileStats", () => {
  it("returns empty values when the player has no recorded point", () => {
    expect(
      computeProfileStats(
        history(["bob", "2026-10-01T00:00:00Z"]),
        "alice",
        now
      )
    ).toEqual({
      monthPoints: 0,
      bestHoldSeconds: null,
      currentStreak: 0,
      bestStreak: 0,
      lastPointAt: null,
    });
  });

  it("handles an empty history", () => {
    expect(computeProfileStats([], "alice", now).currentStreak).toBe(0);
  });

  it("counts only the points of the current UTC calendar month", () => {
    const stats = computeProfileStats(
      history(
        ["alice", "2026-09-30T23:59:59Z"],
        ["alice", "2026-10-01T00:00:00Z"],
        ["alice", "2026-10-12T11:00:00Z"],
        ["alice", "2025-10-05T00:00:00Z"]
      ),
      "alice",
      now
    );

    expect(stats.monthPoints).toBe(2);
  });

  it("keeps the longest hold and the latest point", () => {
    const stats = computeProfileStats(
      history(
        ["alice", "2026-10-01T00:00:00Z", 20_000],
        ["alice", "2026-10-02T00:00:00Z", 90_000],
        ["alice", "2026-10-03T00:00:00Z", 15_000]
      ),
      "alice",
      now
    );

    expect(stats.bestHoldSeconds).toBe(90_000);
    expect(stats.lastPointAt).toEqual(new Date("2026-10-03T00:00:00Z"));
  });

  it("counts the current streak back from the last point of the server", () => {
    const stats = computeProfileStats(
      history(
        ["alice", "2026-10-01T00:00:00Z"],
        ["alice", "2026-10-02T00:00:00Z"],
        ["alice", "2026-10-03T00:00:00Z"],
        ["bob", "2026-10-04T00:00:00Z"],
        ["alice", "2026-10-05T00:00:00Z"],
        ["alice", "2026-10-06T00:00:00Z"]
      ),
      "alice",
      now
    );

    expect(stats.currentStreak).toBe(2);
    expect(stats.bestStreak).toBe(3);
  });

  it("has no current streak when someone else scored last", () => {
    const stats = computeProfileStats(
      history(
        ["alice", "2026-10-01T00:00:00Z"],
        ["alice", "2026-10-02T00:00:00Z"],
        ["bob", "2026-10-03T00:00:00Z"]
      ),
      "alice",
      now
    );

    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(2);
  });

  it("lets the current streak be the record", () => {
    const stats = computeProfileStats(
      history(
        ["bob", "2026-10-01T00:00:00Z"],
        ["alice", "2026-10-02T00:00:00Z"],
        ["alice", "2026-10-03T00:00:00Z"]
      ),
      "alice",
      now
    );

    expect(stats).toMatchObject({ currentStreak: 2, bestStreak: 2 });
  });
});
