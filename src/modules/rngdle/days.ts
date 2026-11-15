// RNGdle days run from midnight to midnight UTC.

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function nextUtcMidnight(date: Date): Date {
  return new Date(startOfUtcDay(date).getTime() + DAY_MS);
}

// Days since the epoch: equal for two dates of the same UTC day.
export function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}
