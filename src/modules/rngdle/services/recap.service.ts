import type { TFunction } from "#lib/i18n.js";
import { declareService, type Service } from "#lib/service.js";
import { formatSpaced } from "#modules/rngdle/rendering/format.js";
import type { ScoreTable, TierOrError } from "./scoring.service.js";
import stats from "./stats.service.js";
import type { StoredRoll } from "./store.service.js";

export const MESSAGE_LIMIT = 2000;

const RARE_TIERS = new Set<TierOrError>(["RARE", "EPIC", "ANOMALY", "MYTHIC"]);
const STREAK_MILESTONES = new Set([7, 30, 50, 100, 200, 365]);

export interface StreakMilestone {
  userId: string;
  days: number;
}

export interface DailyRecap {
  participants: number;
  rarest: { userId: string; tier: TierOrError; topPercent: number } | null;
  worst: { userId: string; score: number } | null;
  streaks: StreakMilestone[];
}

export class RecapService implements Service {
  isStreakMilestone(days: number): boolean {
    return STREAK_MILESTONES.has(days) || (days > 100 && days % 100 === 0);
  }

  computeDailyRecap(
    history: StoredRoll[],
    day: Date,
    table: ScoreTable
  ): DailyRecap | null {
    const dayStart = Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate()
    );
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const dayRolls = history.filter((roll) => {
      const time = roll.rolledAt.getTime();
      return time >= dayStart && time < dayEnd;
    });
    const [first] = dayRolls;
    if (!first) {
      return null;
    }

    let best = first;
    let worst = first;
    for (const roll of dayRolls) {
      if (roll.score > best.score) best = roll;
      if (roll.score < worst.score) worst = roll;
    }

    const players = new Set(dayRolls.map((roll) => roll.userId));
    const bestTier = table.tierOf(best.score);

    const pastByPlayer = new Map<string, StoredRoll[]>();
    for (const roll of history) {
      if (players.has(roll.userId) && roll.rolledAt.getTime() < dayEnd) {
        const rolls = pastByPlayer.get(roll.userId) ?? [];
        rolls.push(roll);
        pastByPlayer.set(roll.userId, rolls);
      }
    }
    const streaks = [...pastByPlayer]
      .map(([userId, rolls]) => ({
        userId,
        days: stats.computeStreaks(rolls, new Date(dayStart)).current,
      }))
      .filter((streak) => this.isStreakMilestone(streak.days))
      .sort((a, b) => b.days - a.days || a.userId.localeCompare(b.userId));

    return {
      participants: players.size,
      rarest: RARE_TIERS.has(bestTier)
        ? {
            userId: best.userId,
            tier: bestTier,
            topPercent: Math.max(0, 100 - table.percentOf(best.score)),
          }
        : null,
      worst:
        players.size > 1 && worst.score < best.score
          ? { userId: worst.userId, score: worst.score }
          : null,
      streaks,
    };
  }

  private mention(userId: string): string {
    return `<@${userId}>`;
  }

  buildDailyMessage(
    winnerIds: string[],
    recap: DailyRecap | null,
    t: TFunction,
    locale: string
  ): string {
    const lines = [
      t("daily.message", { winners: winnerIds.map(this.mention).join(" ") }),
    ];
    if (recap) {
      lines.push(t("daily.participants", { count: recap.participants }));
      if (recap.rarest) {
        lines.push(
          t("daily.rarest", {
            user: this.mention(recap.rarest.userId),
            tier: recap.rarest.tier,
            percent: recap.rarest.topPercent.toLocaleString(locale, {
              maximumSignificantDigits: 2,
            }),
          })
        );
      }
      if (recap.worst) {
        lines.push(
          t("daily.worst", {
            user: this.mention(recap.worst.userId),
            score: formatSpaced(recap.worst.score),
            count: recap.worst.score,
          })
        );
      }
    }

    let message = lines.join("\n");
    const streaks = recap?.streaks ?? [];
    for (const [index, streak] of streaks.entries()) {
      const line = t("daily.streak", {
        user: this.mention(streak.userId),
        count: streak.days,
      });
      const remaining = streaks.length - index - 1;
      const reserve =
        remaining > 0
          ? 1 + t("daily.moreStreaks", { count: remaining }).length
          : 0;
      if (message.length + 1 + line.length + reserve > MESSAGE_LIMIT) {
        const more = t("daily.moreStreaks", { count: streaks.length - index });
        if (message.length + 1 + more.length <= MESSAGE_LIMIT) {
          message += `\n${more}`;
        }
        break;
      }
      message += `\n${line}`;
    }
    return message;
  }
}

export default declareService(new RecapService());
