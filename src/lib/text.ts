function prefix(text: string, budget: number): string {
  let kept = "";
  for (const character of text) {
    if (kept.length + character.length > budget) {
      break;
    }
    kept += character;
  }
  return kept;
}

function opensSpoiler(text: string): boolean {
  return text.split("||").length % 2 === 0;
}

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  const kept = prefix(text, limit - 1);
  if (!opensSpoiler(kept)) {
    return `${kept}…`;
  }
  const shorter = prefix(text, limit - 3);
  return opensSpoiler(shorter) ? `${shorter}||…` : `${shorter}…`;
}

/**
 * A text as a Markdown quote, one `> ` per line: discord.js's `quote` only
 * quotes the first.
 */
export function quoteEachLine(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
