import { declareService, type Service } from "#lib/service.js";
import { TIERS, type ScoreTable, type Tier } from "./scoring.service.js";
import type { StoredRoll } from "./store.service.js";

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
const DAY_MS = 24 * 60 * 60 * 1000;

export class StatsService implements Service {
  private utcDay(date: Date): number {
    return Math.floor(date.getTime() / DAY_MS);
  }

  computeStreaks(rolls: Pick<StoredRoll, "rolledAt">[], now: Date): Streaks {
    const days = [
      ...new Set(rolls.map((roll) => this.utcDay(roll.rolledAt))),
    ].sort((a, b) => a - b);

    let best = 0;
    let run = 0;
    let previous: number | undefined;
    for (const day of days) {
      run = previous !== undefined && day === previous + 1 ? run + 1 : 1;
      best = Math.max(best, run);
      previous = day;
    }

    const today = this.utcDay(now);
    const current =
      previous !== undefined && (previous === today || previous === today - 1)
        ? run
        : 0;
    return { current, best };
  }

  private emptyTierCounts(): Record<Tier, number> {
    return Object.fromEntries(TIERS.map((tier) => [tier, 0])) as Record<
      Tier,
      number
    >;
  }

  private summarize(roll: StoredRoll): RollSummary {
    return {
      userId: roll.userId,
      number: roll.number,
      score: roll.score,
      rolledAt: roll.rolledAt,
    };
  }

  computeRollStats(rolls: StoredRoll[], table: ScoreTable): RollStats | null {
    const [first] = rolls;
    if (!first) {
      return null;
    }

    let best = first;
    let worst = first;
    let totalScore = 0;
    let maxBadges = 0;
    const tierCounts = this.emptyTierCounts();

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
      best: this.summarize(best),
      worst: this.summarize(worst),
      maxBadges,
      tierCounts,
    };
  }

  computeServerStats(
    rolls: StoredRoll[],
    table: ScoreTable
  ): ServerRollStats | null {
    const stats = this.computeRollStats(rolls, table);
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
}

export default declareService(new StatsService());
