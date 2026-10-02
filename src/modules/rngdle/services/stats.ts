import type { StoredRoll } from "./rngdle.service.js";
import { TIERS, type ScoreTable, type Tier } from "./score-table.js";

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

const TIER_LEADERS = 3;

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
