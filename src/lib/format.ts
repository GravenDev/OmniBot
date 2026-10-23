// A whole number with the thousands separator of the locale ("1 234" in
// French, "1,234" in English), decimals dropped. The non-breaking spaces Intl
// uses become plain ones, which every font draws.
export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
    .format(Math.trunc(value))
    .replace(/[  ]/g, " ");
}
