import { addDays, dayOf } from "./day.js";
import type { Totals } from "./store.js";

export const TREND_DAYS = 7;
export const MIN_RECORD_DAYS = 7;
export const MIN_RECORD_VALUE = 5;

export const METRICS = [
  "joins",
  "messages",
  "activeMembers",
  "reactions",
] as const;

export type Metric = (typeof METRICS)[number];

export interface Insight {
  change: number | null;
  record: boolean;
}

export type Insights = Record<Metric, Insight>;

export function previousDays(
  day: Date,
  startedAt: Date,
  limit: number
): Date[] {
  const firstFullDay = addDays(dayOf(startedAt), 1);
  const days: Date[] = [];
  for (let offset = 1; offset <= limit; offset++) {
    const previous = addDays(day, -offset);
    if (previous < firstFullDay) {
      break;
    }
    days.push(previous);
  }
  return days;
}

export function compare(today: Totals, previous: Totals[]): Insights {
  const recent = previous.slice(0, TREND_DAYS);
  const insight = (metric: Metric): Insight => {
    const average =
      recent.reduce((sum, totals) => sum + totals[metric], 0) /
      Math.max(recent.length, 1);
    const best = Math.max(0, ...previous.map((totals) => totals[metric]));
    return {
      change: average > 0 ? today[metric] / average - 1 : null,
      record:
        previous.length >= MIN_RECORD_DAYS &&
        today[metric] >= MIN_RECORD_VALUE &&
        today[metric] > best,
    };
  };
  return Object.fromEntries(
    METRICS.map((metric) => [metric, insight(metric)])
  ) as Insights;
}
