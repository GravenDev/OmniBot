import { createRequire } from "node:module";

interface CompactEmoji {
  hexcode: string;
  unicode: string;
  skins?: CompactEmoji[];
}

type Shortcodes = Record<string, string | string[]>;

const require = createRequire(import.meta.url);

const SHORTCODE_SOURCES = ["joypixels", "github", "iamcal"] as const;

let index: Map<string, string> | undefined;

function buildIndex(): Map<string, string> {
  const unicode = new Map<string, string>();
  const emojis = require("emojibase-data/en/compact.json") as CompactEmoji[];
  for (const emoji of emojis) {
    unicode.set(emoji.hexcode, emoji.unicode);
    for (const skin of emoji.skins ?? []) {
      unicode.set(skin.hexcode, skin.unicode);
    }
  }

  const shortcodes = new Map<string, string>();
  for (const source of SHORTCODE_SOURCES) {
    const dataset = require(
      `emojibase-data/en/shortcodes/${source}.json`
    ) as Shortcodes;
    for (const [hexcode, names] of Object.entries(dataset)) {
      const emoji = unicode.get(hexcode);
      if (!emoji) {
        continue;
      }
      for (const name of [names].flat()) {
        if (!shortcodes.has(name)) {
          shortcodes.set(name, emoji);
        }
      }
    }
  }
  return shortcodes;
}

export function emojiFromShortcode(name: string): string | null {
  index ??= buildIndex();
  return index.get(name.toLowerCase()) ?? null;
}

/** A guild emoji's full form: `<:name:id>`, `<a:name:id>` when animated. */
export const CUSTOM_EMOJI_SOURCE = String.raw`<a?:\w{2,32}:\d{17,20}>`;

// Kept whole, in this order: code (any number of backticks), a link, a
// guild emoji's full form. Then a shortcode as one types it: lowercase, not
// glued to a letter or digit (accented ones included), not escaped.
const SHORTCODE_IN_TEXT = new RegExp(
  String.raw`(\x60+)[\s\S]*?\1|<https?:[^>]*>|https?:\/\/[^\s)>]+|${CUSTOM_EMOJI_SOURCE}|(?<![\p{L}\p{N}\\]):([a-z0-9_+-]+):(?![\p{L}\p{N}])`,
  "gu"
);

/**
 * Text with its emoji shortcodes (`:tada:`) turned into emojis, as Discord's
 * message box does; a modal, such as a /config window, leaves them as typed.
 * Left as written: code, links, escaped or capitalised shortcodes, those glued
 * to a word (`IT:FR:DE`, `10:30:00`), unknown names, and the names of the guild's
 * own emojis (`guildEmojiNames`), which a standard emoji must not replace.
 */
export function expandShortcodes(
  text: string,
  guildEmojiNames: Iterable<string> = []
): string {
  // Shortcodes are lowercase; a guild emoji may not be (`Star` for :star:).
  const guild = new Set([...guildEmojiNames].map((name) => name.toLowerCase()));
  return text.replace(
    SHORTCODE_IN_TEXT,
    (match, _code: string | undefined, name: string | undefined) =>
      (name && !guild.has(name) && emojiFromShortcode(name)) || match
  );
}
