import type { DayOfYear } from "#lib/calendar.js";

/** 29 February counts as its own day in collisions, but not in the formula. */
export const DAYS_IN_YEAR = 365;

/** Probability that at least two of `n` people share a birthday. */
export function collisionProbability(n: number): number {
  let distinct = 1;
  for (let k = 0; k < n; k++) {
    distinct *= (DAYS_IN_YEAR - k) / DAYS_IN_YEAR;
    if (distinct <= 0) {
      return 1;
    }
  }
  return 1 - distinct;
}

/** Smallest group size whose collision probability reaches `probability`. */
export function groupSizeFor(probability: number): number {
  let n = 0;
  while (collisionProbability(n) < probability) {
    n++;
  }
  return n;
}

/** Expected size of the group when the first shared birthday appears (≈ 24.6). */
export function expectedFirstCollision(): number {
  let expected = 0;
  let noCollision = 1;
  for (let k = 0; k <= DAYS_IN_YEAR; k++) {
    expected += noCollision;
    noCollision *= (DAYS_IN_YEAR - k) / DAYS_IN_YEAR;
  }
  return expected;
}

export interface SharedDate<T extends DayOfYear> extends DayOfYear {
  entries: T[];
}

/** Dates registered by two members or more, in calendar order. */
export function sharedDates<T extends DayOfYear>(
  entries: readonly T[]
): SharedDate<T>[] {
  const byDate = new Map<number, SharedDate<T>>();
  for (const entry of entries) {
    const key = entry.month * 100 + entry.day;
    const shared = byDate.get(key) ?? {
      day: entry.day,
      month: entry.month,
      entries: [],
    };
    shared.entries.push(entry);
    byDate.set(key, shared);
  }
  return [...byDate.entries()]
    .filter(([, shared]) => shared.entries.length >= 2)
    .sort(([a], [b]) => a - b)
    .map(([, shared]) => shared);
}

export const MILESTONES = ["half", "first-collision", "certain"] as const;
export type Milestone = (typeof MILESTONES)[number];

export const HALF_GROUP_SIZE = groupSizeFor(0.5);
export const CERTAIN_GROUP_SIZE = groupSizeFor(0.99);

/** Milestones reached by the guild's registrations and not announced yet. */
export function newMilestones(
  count: number,
  hasCollision: boolean,
  announced: readonly string[]
): Milestone[] {
  const reached: Record<Milestone, boolean> = {
    half: count >= HALF_GROUP_SIZE,
    "first-collision": hasCollision,
    certain: count >= CERTAIN_GROUP_SIZE,
  };
  return MILESTONES.filter(
    (milestone) => reached[milestone] && !announced.includes(milestone)
  );
}
