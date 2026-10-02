export function formatSpaced(value: number): string {
  const sign = value < 0 ? "-" : "";
  return (
    sign +
    String(Math.trunc(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  );
}

const COMPACT_SUFFIXES = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "k"],
] as const;

export function formatCompact(value: number): string {
  for (const [threshold, suffix] of COMPACT_SUFFIXES) {
    if (value >= threshold) {
      return `${(value / threshold).toFixed(1)}${suffix}`;
    }
  }
  return String(value);
}

export function formatShort(value: number, locale: string): string {
  const suffixes = [
    [1_000_000_000, locale === "fr" ? "Md" : "B"],
    [1_000_000, "M"],
    [1_000, "k"],
  ] as const;
  for (const [threshold, suffix] of suffixes) {
    if (value >= threshold) {
      return `${(value / threshold).toFixed(1).replace(".0", "")}${suffix}`;
    }
  }
  return String(value);
}
