import { utcDayNumber } from "./days.js";
import { TIERS, type ScoreTable, type Tier } from "./scoring.js";
import type { StoredRoll } from "./store.js";

export interface RollSummary {
  userId: string;
  number: number;
  score: number;
  rolledAt: Date;
}

export interface RollStats {
  totalRolls: number;
  totalScore: number;
  averageScore: number;
  best: RollSummary;
  worst: RollSummary;
  maxBadges: number;
  tierCounts: Record<Tier, number>;
}

export interface ServerRollStats extends RollStats {
  tierLeaders: Record<Tier, string[]>;
}

export interface Streaks {
  current: number;
  best: number;
}

const TIER_LEADERS = 3;

export function computeStreaks(
  rolls: Pick<StoredRoll, "rolledAt">[],
  now: Date
): Streaks {
  const days = [
    ...new Set(rolls.map((roll) => utcDayNumber(roll.rolledAt))),
  ].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let previous: number | undefined;
  for (const day of days) {
    run = previous !== undefined && day === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  const today = utcDayNumber(now);
  const current =
    previous !== undefined && (previous === today || previous === today - 1)
      ? run
      : 0;
  return { current, best };
}

function emptyTierCounts(): Record<Tier, number> {
  return Object.fromEntries(TIERS.map((tier) => [tier, 0])) as Record<
    Tier,
    number
  >;
}

function summarize(roll: StoredRoll): RollSummary {
  return {
    userId: roll.userId,
    number: roll.number,
    score: roll.score,
    rolledAt: roll.rolledAt,
  };
}

export function computeRollStats(
  rolls: StoredRoll[],
  table: ScoreTable
): RollStats | null {
  const [first] = rolls;
  if (!first) {
    return null;
  }

  let best = first;
  let worst = first;
  let totalScore = 0;
  let maxBadges = 0;
  const tierCounts = emptyTierCounts();

  for (const roll of rolls) {
    totalScore += roll.score;
    if (roll.score > best.score) best = roll;
    if (roll.score < worst.score) worst = roll;
    maxBadges = Math.max(maxBadges, roll.badgeCount);
    const tier = table.tierOf(roll.score);
    if (tier !== "ERROR") {
      tierCounts[tier] += 1;
    }
  }

  return {
    totalRolls: rolls.length,
    totalScore,
    averageScore: Math.trunc(totalScore / rolls.length),
    best: summarize(best),
    worst: summarize(worst),
    maxBadges,
    tierCounts,
  };
}

export function computeServerStats(
  rolls: StoredRoll[],
  table: ScoreTable
): ServerRollStats | null {
  const stats = computeRollStats(rolls, table);
  if (!stats) {
    return null;
  }

  const countsByTier = new Map<Tier, Map<string, number>>();
  for (const roll of rolls) {
    const tier = table.tierOf(roll.score);
    if (tier === "ERROR") {
      continue;
    }
    const counts = countsByTier.get(tier) ?? new Map<string, number>();
    counts.set(roll.userId, (counts.get(roll.userId) ?? 0) + 1);
    countsByTier.set(tier, counts);
  }

  const tierLeaders = Object.fromEntries(
    TIERS.map((tier) => [
      tier,
      [...(countsByTier.get(tier) ?? new Map<string, number>())]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TIER_LEADERS)
        .map(([userId]) => userId),
    ])
  ) as Record<Tier, string[]>;

  return { ...stats, tierLeaders };
}

export const RANKING_PRIOR = 20;

export interface RankingEntry {
  userId: string;
  rolls: number;
  total: number;
  index: number;
  best: RollSummary;
}

export function rankingIndex(
  total: number,
  rolls: number,
  prior = RANKING_PRIOR
): number {
  return total / (rolls + prior);
}

export function computeRanking(
  rolls: StoredRoll[],
  prior = RANKING_PRIOR
): RankingEntry[] {
  const players = new Map<
    string,
    { rolls: number; total: number; best: StoredRoll }
  >();
  for (const roll of rolls) {
    const player = players.get(roll.userId);
    if (!player) {
      players.set(roll.userId, { rolls: 1, total: roll.score, best: roll });
      continue;
    }
    player.rolls += 1;
    player.total += roll.score;
    if (roll.score > player.best.score) {
      player.best = roll;
    }
  }

  return [...players]
    .map(([userId, player]) => ({
      userId,
      rolls: player.rolls,
      total: player.total,
      index: rankingIndex(player.total, player.rolls, prior),
      best: summarize(player.best),
    }))
    .sort(
      (a, b) =>
        b.index - a.index ||
        b.total - a.total ||
        a.userId.localeCompare(b.userId)
    );
}

export function byBestRoll(entries: RankingEntry[]): RankingEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.best.score - a.best.score ||
      a.best.rolledAt.getTime() - b.best.rolledAt.getTime() ||
      a.userId.localeCompare(b.userId)
  );
}
