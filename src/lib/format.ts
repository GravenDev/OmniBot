// Intl separates digits with non-breaking spaces in French; plain ones draw
// with every font.
const NON_BREAKING_SPACES = /[\u00a0\u202f]/g;

// A whole number with the thousands separator of the locale ("1 234" in
// French, "1,234" in English), decimals dropped.
export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
    .format(Math.trunc(value))
    .replace(NON_BREAKING_SPACES, " ");
}

// A percentage, spaced as the locale writes it ("4 %" in French, "4%" in
// English).
export function formatPercentage(
  value: number,
  locale: string,
  maximumFractionDigits = 0
): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits,
  })
    .format(value / 100)
    .replace(NON_BREAKING_SPACES, " ");
}

const DESCRIPTION_LIMIT = 4096;
const MORE_LINE_RESERVE = 64;

export function describeLines(
  lines: string[],
  more: (count: number) => string
): string {
  const budget = DESCRIPTION_LIMIT - MORE_LINE_RESERVE;
  const shown: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > budget) {
      break;
    }
    shown.push(line);
    length += line.length + 1;
  }
  const hidden = lines.length - shown.length;
  return [...shown, ...(hidden > 0 ? [more(hidden)] : [])].join("\n");
}

// The decimal separator of the locale: "," in French, "." in English.
export function decimalSeparator(locale: string): string {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(1.5)
      .find((part) => part.type === "decimal")?.value ?? "."
  );
}
