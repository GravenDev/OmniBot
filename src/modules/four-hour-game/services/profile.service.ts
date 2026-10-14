import { declareService, type Service } from "#lib/service.js";

export interface AwardedPoint {
  userId: string;
  heldSeconds: number;
  awardedAt: Date;
}

export interface ProfileStats {
  monthPoints: number;
  bestHoldSeconds: number | null;
  currentStreak: number;
  bestStreak: number;
  lastPointAt: Date | null;
}

export class ProfileService implements Service {
  computeProfileStats(
    history: readonly AwardedPoint[],
    userId: string,
    now: Date
  ): ProfileStats {
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    let monthPoints = 0;
    let bestHoldSeconds: number | null = null;
    let lastPointAt: Date | null = null;
    let streak = 0;
    let bestStreak = 0;

    for (const point of history) {
      if (point.userId !== userId) {
        streak = 0;
        continue;
      }
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      bestHoldSeconds = Math.max(bestHoldSeconds ?? 0, point.heldSeconds);
      if (point.awardedAt.getTime() >= monthStart) {
        monthPoints += 1;
      }
      if (!lastPointAt || point.awardedAt.getTime() > lastPointAt.getTime()) {
        lastPointAt = point.awardedAt;
      }
    }

    return {
      monthPoints,
      bestHoldSeconds,
      currentStreak: streak,
      bestStreak,
      lastPointAt,
    };
  }
}

export default declareService(new ProfileService());
