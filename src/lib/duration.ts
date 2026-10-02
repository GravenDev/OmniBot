const UNIT_SECONDS = {
  d: 24 * 60 * 60,
  h: 60 * 60,
  m: 60,
  s: 1,
} as const;

type DurationUnit = keyof typeof UNIT_SECONDS;

const DURATION_PATTERN = /^(?:\d+[dhms])+$/;
const DURATION_PART = /(\d+)([dhms])/g;

export function parseDuration(raw: string): number | null {
  const input = raw.replace(/\s+/g, "").toLowerCase();
  if (!DURATION_PATTERN.test(input)) {
    return null;
  }

  let seconds = 0;
  for (const [, amount, unit] of input.matchAll(DURATION_PART)) {
    seconds += Number(amount) * UNIT_SECONDS[unit as DurationUnit];
  }

  return seconds > 0 && Number.isSafeInteger(seconds) ? seconds : null;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0s";
  }

  let remaining = Math.floor(totalSeconds);
  let result = "";
  for (const [unit, size] of Object.entries(UNIT_SECONDS)) {
    const amount = Math.floor(remaining / size);
    if (amount > 0) {
      result += `${amount}${unit}`;
      remaining -= amount * size;
    }
  }
  return result;
}
