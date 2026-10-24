const HIDDEN_PATTERN =
  /```[\s\S]*?```|``[\s\S]*?``|`[^`\n]*`|\|\|[\s\S]*?\|\|/g;

/** Removes code spans, code blocks and spoilers, whose links are not meant to act. */
export function stripHiddenText(content: string): string {
  return content.replace(HIDDEN_PATTERN, "");
}
