export const TIMEZONE = "Europe/Paris";

const DAY_MS = 86_400_000;

const calendarDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dayOf(date: Date): Date {
  return new Date(`${calendarDate.format(date)}T00:00:00Z`);
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}
