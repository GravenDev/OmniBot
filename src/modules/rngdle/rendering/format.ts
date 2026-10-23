import { decimalSeparator, formatInteger } from "#lib/format.js";

const THRESHOLDS = [1_000_000_000, 1_000_000, 1_000] as const;

function abbreviate(
  value: number,
  suffixes: readonly string[],
  format: (scaled: number) => string
): string {
  const index = THRESHOLDS.findIndex((threshold) => value >= threshold);
  return index < 0
    ? String(value)
    : format(value / THRESHOLDS[index]!) + suffixes[index];
}

export function formatEp(value: number, locale: string): string {
  return `${formatInteger(value, locale)} EP`;
}

// French abbreviates billions as "Md" (milliards).
function suffixesFor(locale: string): string[] {
  return [locale === "fr" ? "Md" : "B", "M", "k"];
}

function withDecimalSeparator(text: string, locale: string): string {
  return text.replace(".", decimalSeparator(locale));
}

export function formatCompact(value: number, locale: string): string {
  return abbreviate(value, suffixesFor(locale), (scaled) =>
    withDecimalSeparator(scaled.toFixed(1), locale)
  );
}

export function formatIndex(value: number, locale: string): string {
  return formatCompact(Math.round(value), locale);
}

export function formatShort(value: number, locale: string): string {
  return abbreviate(value, suffixesFor(locale), (scaled) =>
    withDecimalSeparator(scaled.toFixed(1).replace(".0", ""), locale)
  );
}

export function formatExpected(locale: string, value: number): string {
  const tenths = Math.round(value * 10) / 10;
  if (tenths < 10) {
    return tenths.toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  const rounded = Math.round(value);
  return rounded < 100_000
    ? formatInteger(rounded, locale)
    : formatShort(rounded, locale);
}
