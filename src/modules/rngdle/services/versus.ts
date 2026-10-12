import type { StoredRoll } from "./store.js";

export type Side = "left" | "right";
export type Winner = Side | "tie";

export interface VersusSide {
  totalScore: number;
  totalRolls: number;
  averageScore: number | null;
  best: { number: number; score: number } | null;
  maxBadges: number | null;
}

export interface HeadToHead {
  days: number;
  left: number;
  right: number;
  ties: number;
}

export interface VersusWinners {
  totalScore: Winner;
  totalRolls: Winner;
  averageScore: Winner | null;
  bestRoll: Winner | null;
  maxBadges: Winner | null;
  headToHead: Winner | null;
}

export interface Versus {
  left: VersusSide;
  right: VersusSide;
  headToHead: HeadToHead;
  winners: VersusWinners;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function summarize(rolls: StoredRoll[]): VersusSide {
  let totalScore = 0;
  let maxBadges = 0;
  let best: StoredRoll | null = null;
  for (const roll of rolls) {
    totalScore += roll.score;
    maxBadges = Math.max(maxBadges, roll.badgeCount);
    if (!best || roll.score > best.score) {
      best = roll;
    }
  }
  return {
    totalScore,
    totalRolls: rolls.length,
    averageScore:
      rolls.length > 0 ? Math.trunc(totalScore / rolls.length) : null,
    best: best && { number: best.number, score: best.score },
    maxBadges: rolls.length > 0 ? maxBadges : null,
  };
}

function bestByDay(rolls: StoredRoll[]): Map<number, number> {
  const days = new Map<number, number>();
  for (const roll of rolls) {
    const day = Math.floor(roll.rolledAt.getTime() / DAY_MS);
    days.set(day, Math.max(days.get(day) ?? -Infinity, roll.score));
  }
  return days;
}

export function computeHeadToHead(
  leftRolls: StoredRoll[],
  rightRolls: StoredRoll[]
): HeadToHead {
  const rightDays = bestByDay(rightRolls);
  const result: HeadToHead = { days: 0, left: 0, right: 0, ties: 0 };
  for (const [day, leftScore] of bestByDay(leftRolls)) {
    const rightScore = rightDays.get(day);
    if (rightScore === undefined) {
      continue;
    }
    result.days += 1;
    if (leftScore > rightScore) result.left += 1;
    else if (rightScore > leftScore) result.right += 1;
    else result.ties += 1;
  }
  return result;
}

export function compare(left: number, right: number): Winner;
export function compare(
  left: number | null,
  right: number | null
): Winner | null;
export function compare(
  left: number | null,
  right: number | null
): Winner | null {
  if (left === null && right === null) return null;
  if (right === null) return "left";
  if (left === null) return "right";
  if (left > right) return "left";
  if (right > left) return "right";
  return "tie";
}

export function computeVersus(
  leftRolls: StoredRoll[],
  rightRolls: StoredRoll[]
): Versus | null {
  if (leftRolls.length === 0 && rightRolls.length === 0) {
    return null;
  }
  const left = summarize(leftRolls);
  const right = summarize(rightRolls);
  const headToHead = computeHeadToHead(leftRolls, rightRolls);
  return {
    left,
    right,
    headToHead,
    winners: {
      totalScore: compare(left.totalScore, right.totalScore),
      totalRolls: compare(left.totalRolls, right.totalRolls),
      averageScore: compare(left.averageScore, right.averageScore),
      bestRoll: compare(left.best?.score ?? null, right.best?.score ?? null),
      maxBadges: compare(left.maxBadges, right.maxBadges),
      headToHead:
        headToHead.days > 0 ? compare(headToHead.left, headToHead.right) : null,
    },
  };
}
