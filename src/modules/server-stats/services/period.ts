import { addDays, dayOf, RETENTION_DAYS } from "./day.js";

export const PERIOD_DAYS = [7, 14, 30, 90, 365] as const;
export const DEFAULT_PERIOD_DAYS = 7;

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DAY_MONTH = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/;

export interface Selection {
  from: Date;
  to: Date;
}

export type SelectionError =
  | { error: "invalidDate"; value: string }
  | { error: "future" }
  | { error: "tooOld"; oldest: Date }
  | { error: "daysAndDates" };

export type SelectionResult = { selection: Selection } | SelectionError;

// Today and the RETENTION_DAYS days before it. The purge keeps one more day,
// left out so that a report never races with its deletion at midnight.
export function oldestDay(now: Date): Date {
  return addDays(dayOf(now), -RETENTION_DAYS);
}

function calendarDay(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

// "2026-10-29", "29/10/2026" or "29/10": a day without its year is the last
// one to have come, so "28/12" typed in January is the previous December.
export function parseDay(text: string, now: Date): Date | null {
  const value = text.trim();
  const iso = ISO_DATE.exec(value);
  if (iso) {
    return calendarDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const short = DAY_MONTH.exec(value);
  if (!short) {
    return null;
  }
  const today = dayOf(now);
  const day = Number(short[1]);
  const month = Number(short[2]);
  if (short[3]) {
    return calendarDay(Number(short[3]), month, day);
  }
  const thisYear = calendarDay(today.getUTCFullYear(), month, day);
  return thisYear && thisYear > today
    ? calendarDay(today.getUTCFullYear() - 1, month, day)
    : thisYear;
}

function keptDay(text: string, now: Date): Date | SelectionError {
  const day = parseDay(text, now);
  if (!day) {
    return { error: "invalidDate", value: text };
  }
  if (day > dayOf(now)) {
    return { error: "future" };
  }
  if (day < oldestDay(now)) {
    return { error: "tooOld", oldest: oldestDay(now) };
  }
  return day;
}

export function selectToday(now: Date): SelectionResult {
  const today = dayOf(now);
  return { selection: { from: today, to: today } };
}

export function selectDay(text: string, now: Date): SelectionResult {
  const day = keptDay(text, now);
  return day instanceof Date ? { selection: { from: day, to: day } } : day;
}

// Either the last `days` whole days, today left out, or the days from `from`
// (the oldest kept by default) to `to` (today by default), in either order.
export function selectPeriod(
  options: { days: number | null; from: string | null; to: string | null },
  now: Date
): SelectionResult {
  if (options.days !== null && (options.from !== null || options.to !== null)) {
    return { error: "daysAndDates" };
  }
  if (options.from === null && options.to === null) {
    const yesterday = addDays(dayOf(now), -1);
    const days = options.days ?? DEFAULT_PERIOD_DAYS;
    return {
      selection: { from: addDays(yesterday, 1 - days), to: yesterday },
    };
  }
  const from =
    options.from === null ? oldestDay(now) : keptDay(options.from, now);
  if (!(from instanceof Date)) {
    return from;
  }
  const to = options.to === null ? dayOf(now) : keptDay(options.to, now);
  if (!(to instanceof Date)) {
    return to;
  }
  return {
    selection: from <= to ? { from, to } : { from: to, to: from },
  };
}

// Nothing is counted before counting started: the selection starts that day,
// or is null when it ends before.
export function countedPart(
  selection: Selection,
  startedAt: Date
): Selection | null {
  const firstDay = dayOf(startedAt);
  if (selection.to < firstDay) {
    return null;
  }
  return selection.from < firstDay
    ? { from: firstDay, to: selection.to }
    : selection;
}

export function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

// The kept days, most recent first, for the autocomplete of a date option.
export function dayChoices(
  now: Date,
  name: (day: Date, offset: number) => string
): { name: string; value: string }[] {
  const today = dayOf(now);
  return Array.from({ length: RETENTION_DAYS + 1 }, (_, offset) => {
    const day = addDays(today, -offset);
    return { name: name(day, offset), value: isoDay(day) };
  });
}
