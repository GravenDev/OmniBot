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

export function formatSpaced(value: number): string {
  const sign = value < 0 ? "-" : "";
  return (
    sign +
    String(Math.trunc(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  );
}

export function formatCompact(value: number): string {
  return abbreviate(value, ["B", "M", "k"], (scaled) => scaled.toFixed(1));
}

export function formatIndex(value: number): string {
  return formatCompact(Math.round(value));
}

export function formatShort(value: number, locale: string): string {
  return abbreviate(value, [locale === "fr" ? "Md" : "B", "M", "k"], (scaled) =>
    scaled.toFixed(1).replace(".0", "")
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
    ? formatSpaced(rounded)
    : formatShort(rounded, locale);
}
