import type { TFunction } from "#lib/i18n.js";
import { DAY_MS } from "./days.js";
import type { TimelineMonth } from "./rendering/timeline.js";
import type { DateRange } from "./services/store.service.js";

export const PERIODS = ["all", "month", "week"] as const;

export type Period = (typeof PERIODS)[number];

export function parsePeriod(value: string | null | undefined): Period {
  return PERIODS.find((period) => period === value) ?? "all";
}

export function utcDayRange(daysAgo: number, now = new Date()): [Date, Date] {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysAgo
  );
  return [new Date(start), new Date(start + DAY_MS)];
}

export function periodRange(period: Period, now = new Date()): DateRange {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (period === "month") {
    return {
      from: new Date(Date.UTC(year, month, 1)),
      to: new Date(Date.UTC(year, month + 1, 1)),
    };
  }
  if (period === "week") {
    const sinceMonday = (now.getUTCDay() + 6) % 7;
    const start = Date.UTC(year, month, now.getUTCDate() - sinceMonday);
    return { from: new Date(start), to: new Date(start + 7 * DAY_MS) };
  }
  return {};
}

export function periodText(
  context: { t: TFunction; locale: string },
  period: Period,
  now = new Date(),
  prefix = "overall.period"
): string {
  const { from, to } = periodRange(period, now);
  if (period === "month" && from) {
    const month = new Intl.DateTimeFormat(context.locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(from);
    return context.t(`${prefix}.month`, { month });
  }
  if (period === "week" && from && to) {
    const format = new Intl.DateTimeFormat(context.locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return context.t(`${prefix}.week`, {
      from: format.format(from),
      to: format.format(new Date(to.getTime() - DAY_MS)),
    });
  }
  return context.t(`${prefix}.all`);
}

export function nextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export function monthsBetween(
  locale: string,
  from: Date,
  to: Date
): TimelineMonth[] {
  const short = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const withYear = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const months: TimelineMonth[] = [];
  const first =
    from.getTime() === Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)
      ? from
      : nextMonth(from);
  for (let start = first; start < to; start = nextMonth(start)) {
    const format = start.getUTCMonth() === 0 ? withYear : short;
    months.push({ start, label: format.format(start) });
  }
  return months;
}
