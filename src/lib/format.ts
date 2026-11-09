import { escapeMarkdown } from "discord.js";
import { truncate } from "./text.js";

const PREVIEW_MAX = 80;

const ESCAPE_ALL = {
  maskedLink: true,
  heading: true,
  bulletedList: true,
  numberedList: true,
} as const;

export function preview(content: string): string {
  const line = truncate(content.replace(/\s+/g, " ").trim(), PREVIEW_MAX);
  return escapeMarkdown(line, ESCAPE_ALL).replaceAll("<", "\\<");
}

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
// What a message laid out with components may hold, all its text included.
export const COMPONENTS_TEXT_LIMIT = 4000;
const MORE_LINE_RESERVE = 64;

// Lines within an embed description, or a message with a smaller `limit`; a
// last line from `more` counts the ones left out.
export function describeLines(
  lines: string[],
  more: (count: number) => string,
  limit = DESCRIPTION_LIMIT
): string {
  const budget = limit - MORE_LINE_RESERVE;
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
