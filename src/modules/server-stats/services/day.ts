export const TIMEZONE = "Europe/Paris";

// A year of counters: totals and counts per member, never who joined or left.
export const RETENTION_DAYS = 365;

export const DAY_MS = 86_400_000;

const calendarDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourOfDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  hour: "numeric",
  hourCycle: "h23",
});

export function hourOf(date: Date): number {
  return Number(hourOfDay.format(date));
}

export function dayOf(date: Date): Date {
  return new Date(`${calendarDate.format(date)}T00:00:00Z`);
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}
