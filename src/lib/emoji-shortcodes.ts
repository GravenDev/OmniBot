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
