// Guild-local days for the modules that announce something once a day, in
// the guild's time zone: birthdays, member anniversaries.

/** One zone per guild: a zone per member would be one more piece of personal data. */
export const TIME_ZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Luxembourg",
  "Europe/London",
  "Africa/Casablanca",
  "Africa/Algiers",
  "Africa/Tunis",
  "Africa/Dakar",
  "Africa/Abidjan",
  "Africa/Kinshasa",
  "Indian/Reunion",
  "Indian/Mayotte",
  "America/Martinique",
  "America/Guadeloupe",
  "America/Cayenne",
  "America/Toronto",
  "America/New_York",
  "America/Los_Angeles",
  "Pacific/Noumea",
  "Pacific/Tahiti",
  "Asia/Tokyo",
  "UTC",
] as const;

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

export interface LocalTime extends CalendarDay {
  hour: number;
}

export interface DayOfYear {
  day: number;
  month: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock date and hour of `at` in `timeZone`. */
export function localTime(at: Date, timeZone: string): LocalTime {
  const parts = formatterFor(timeZone).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
  };
}

export function dayKey(date: CalendarDay): string {
  return [date.year, date.month, date.day]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in `month` (1-12) of `year`; a leap year by default, so February has 29. */
export function daysInMonth(month: number, year = 2000): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidDayOfYear({ day, month }: DayOfYear): boolean {
  return (
    Number.isInteger(day) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(month)
  );
}

/** Whether `date` celebrates `birthday`; 29 February is celebrated on the 28th outside leap years. */
export function celebratesOn(birthday: DayOfYear, date: CalendarDay): boolean {
  if (birthday.month === 2 && birthday.day === 29 && !isLeapYear(date.year)) {
    return date.month === 2 && date.day === 28;
  }
  return birthday.month === date.month && birthday.day === date.day;
}

export function addDays(date: CalendarDay, days: number): CalendarDay {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days)
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Full years since `origin` when `today` is its anniversary in `timeZone`,
 * otherwise null. The day the origin happened is not an anniversary.
 */
export function anniversaryYears(
  origin: Date,
  today: CalendarDay,
  timeZone: string
): number | null {
  const start = localTime(origin, timeZone);
  const years = today.year - start.year;
  return years >= 1 && celebratesOn(start, today) ? years : null;
}

export interface Upcoming<T extends DayOfYear> {
  entry: T;
  date: CalendarDay;
  inDays: number;
}

/** Entries celebrated within the next `days` days, today included, soonest first. */
export function upcoming<T extends DayOfYear>(
  entries: readonly T[],
  today: CalendarDay,
  days: number
): Upcoming<T>[] {
  const result: Upcoming<T>[] = [];
  for (let inDays = 0; inDays < days; inDays++) {
    const date = addDays(today, inDays);
    for (const entry of entries) {
      if (celebratesOn(entry, date)) {
        result.push({ entry, date, inDays });
      }
    }
  }
  return result;
}

// French writes the first of the month "1er": the images' font has no
// superscript letters for "1ᵉʳ", and the text says it the same way.
function firstOfMonth(text: string, locale: string): string {
  return locale.startsWith("fr") ? text.replace(/^1 /, "1er ") : text;
}

/** "14 March" / "14 mars", "1er mars", without a year. */
export function formatDayOfYear({ day, month }: DayOfYear, locale: string) {
  const text = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, month - 1, day)));
  return firstOfMonth(text, locale);
}

/** "November 1, 2021" / "1er novembre 2021": `date` as a day in `timeZone`. */
export function formatDate(date: Date, locale: string, timeZone: string) {
  const text = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
  return firstOfMonth(text, locale);
}

/** A configured announcement hour, kept within 0-23 whatever was typed. */
export function announcementHour(hour: number, fallback = 9): number {
  const whole = Math.floor(hour);
  return Number.isFinite(whole) ? Math.min(23, Math.max(0, whole)) : fallback;
}

/**
 * The guild-local day (YYYY-MM-DD) whose announcements are due at `now`, or
 * null: before the announcement hour, or when that day, or a later one after
 * a time zone change, was already announced.
 */
export function dueDay(
  now: Date,
  timeZone: string,
  hour: number,
  lastDay: string | null
): string | null {
  const local = localTime(now, timeZone);
  if (local.hour < announcementHour(hour)) {
    return null;
  }
  const day = dayKey(local);
  return lastDay !== null && day <= lastDay ? null : day;
}
