export const GAME_TIME_ZONE = "Europe/Paris";

export interface DayHold {
  day: string;
  seconds: number;
}

const zoned = new Intl.DateTimeFormat("en-US", {
  timeZone: GAME_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(at: number): ZonedParts {
  const parts = zoned.formatToParts(at);
  const read = (type: keyof ZonedParts) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function parseDay(day: string): [number, number, number] {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return [year, month, date];
}

function shiftDay(day: string, days: number): string {
  const [year, month, date] = parseDay(day);
  return new Date(Date.UTC(year, month - 1, date + days))
    .toISOString()
    .slice(0, 10);
}

function zoneOffset(at: number): number {
  const p = zonedParts(at);
  const wallClock = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  return wallClock - Math.floor(at / 1000) * 1000;
}

export function dayOf(date: Date): string {
  const p = zonedParts(date.getTime());
  return [p.year, p.month, p.day]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

export function nextDay(day: string): string {
  return shiftDay(day, 1);
}

export function previousDay(day: string): string {
  return shiftDay(day, -1);
}

export function startOfDay(day: string): Date {
  const [year, month, date] = parseDay(day);
  const midnight = Date.UTC(year, month - 1, date);
  const guess = midnight - zoneOffset(midnight);
  return new Date(midnight - zoneOffset(guess));
}

export function splitHold(
  start: Date,
  end: Date,
  closedDay: string
): DayHold[] {
  const holds: DayHold[] = [];
  let day = dayOf(start);
  if (day <= closedDay) {
    day = nextDay(closedDay);
  }

  for (
    let dayStart = startOfDay(day).getTime();
    dayStart < end.getTime();
    day = nextDay(day), dayStart = startOfDay(day).getTime()
  ) {
    const from = Math.max(start.getTime(), dayStart);
    const to = Math.min(end.getTime(), startOfDay(nextDay(day)).getTime());
    const seconds = Math.floor((to - from) / 1000);
    if (seconds > 0) {
      holds.push({ day, seconds });
    }
  }
  return holds;
}
