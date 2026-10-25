export function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  let kept = "";
  for (const character of text) {
    if (kept.length + character.length > limit - 1) {
      break;
    }
    kept += character;
  }
  return `${kept}…`;
}
