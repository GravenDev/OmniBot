// The key a reaction is counted under: the emoji itself, or `<:e:id>` for a
// custom one, whose name may change and is not needed to draw it.
const CUSTOM_EMOJI = /^<a?:e:(\d+)>$/;

export function emojiKey(emoji: {
  id: string | null;
  name: string | null;
  animated?: boolean | null;
}): string | null {
  if (emoji.id) {
    return `<${emoji.animated ? "a" : ""}:e:${emoji.id}>`;
  }
  return emoji.name;
}

/** The id of the custom emoji a key stands for, null for a Unicode one. */
export function customEmojiId(key: string): string | null {
  return CUSTOM_EMOJI.exec(key)?.[1] ?? null;
}
