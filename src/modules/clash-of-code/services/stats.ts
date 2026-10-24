import type { StoredParticipation } from "./store.js";

export interface Standing {
  codingamerId: number;
  rank: number;
  wins: number;
  games: number;
}

export interface PlayerStats {
  games: number;
  wins: number;
  winRate: number;
  averageRank: number;
  averageScore: number;
  averageDurationMs: number;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Ranks players by wins, then by fewer games played. Players tied on both
 * share a rank, and the next rank skips accordingly (1, 1, 3).
 */
export function rankByWins(participations: StoredParticipation[]): Standing[] {
  const totals = new Map<number, { wins: number; games: number }>();
  for (const { codingamerId, rank } of participations) {
    const total = totals.get(codingamerId) ?? { wins: 0, games: 0 };
    total.games++;
    if (rank === 1) {
      total.wins++;
    }
    totals.set(codingamerId, total);
  }

  const sorted = [...totals]
    .map(([codingamerId, total]) => ({ codingamerId, ...total }))
    .sort(
      (a, b) =>
        b.wins - a.wins || a.games - b.games || a.codingamerId - b.codingamerId
    );
  return sorted.map((entry) => {
    const first = sorted.findIndex(
      (other) => other.wins === entry.wins && other.games === entry.games
    );
    return { ...entry, rank: first + 1 };
  });
}

export function playerStats(
  participations: StoredParticipation[]
): PlayerStats | null {
  const games = participations.length;
  if (games === 0) {
    return null;
  }
  const wins = participations.filter(({ rank }) => rank === 1).length;
  return {
    games,
    wins,
    winRate: wins / games,
    averageRank: sum(participations.map(({ rank }) => rank)) / games,
    averageScore: sum(participations.map(({ score }) => score)) / games,
    averageDurationMs:
      sum(participations.map(({ durationMs }) => durationMs)) / games,
  };
}
