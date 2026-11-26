import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";
import sharp from "sharp";
import type { Classification } from "wintrchess/classify";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import { RATING_ASSETS, RATING_ORDER } from "../ratings.js";

const logger = loggerMaker("chess");

/** WintrChess rating emojis, keyed by classification. */
export type RatingEmojis = Record<Classification, string>;

/**
 * Annotation marks shown while the application emojis are unavailable: the
 * module keeps working, and the hourly retry switches to the emojis.
 */
const TEXT_BADGES: RatingEmojis = {
  brilliant: "!!",
  critical: "!",
  best: "★",
  excellent: "✓✓",
  okay: "✓",
  inaccuracy: "?!",
  mistake: "?",
  miss: "✗",
  blunder: "??",
  theory: "📖",
  forced: "→",
  risky: "!?",
};

// The application emojis are named after the rating assets, without extension.
const EMOJI_NAMES = RATING_ORDER.map((rating) => RATING_ASSETS[rating]);

/** Why the emojis could not be loaded; `ensure` logs it. */
function unavailable(reason: string, cause?: unknown): never {
  const message = `Chess rating emojis unavailable: ${reason}`;
  throw cause === undefined
    ? new Error(message)
    : new Error(message, { cause });
}

/** Discord takes emoji images up to 256 KiB; the badges are 8192 px PNGs. */
const EMOJI_SIZE = 128;
const RATINGS = new URL("../assets/ratings/", import.meta.url);

function emojiImage(name: string): Promise<Buffer> {
  return sharp(fileURLToPath(new URL(`${name}.png`, RATINGS)))
    .resize(EMOJI_SIZE, EMOJI_SIZE)
    .png()
    .toBuffer();
}

/**
 * Application emojis are named exactly after the rating assets. Missing ones
 * are created from the module's own badges, so an instance needs no setup; one
 * that can be neither found nor created makes the load fail, naming both the
 * missing and the found emojis.
 */
export async function loadRatingEmojis(client: Client): Promise<RatingEmojis> {
  if (!client.application) {
    unavailable("no Discord application available");
  }

  let emojis;
  try {
    emojis = await client.application.emojis.fetch();
  } catch (error) {
    unavailable("cannot fetch application emojis", error);
  }

  const found = new Map(
    emojis.map((emoji) => [emoji.name, emoji.toString()] as const)
  );
  for (const name of EMOJI_NAMES.filter((name) => !found.has(name))) {
    // One at a time: a dozen creations at once would hit Discord's rate limit
    // on the application's emoji route.
    try {
      const emoji = await client.application.emojis.create({
        attachment: await emojiImage(name),
        name,
      });
      found.set(name, emoji.toString());
      logger.info(`Chess rating emoji created | name = ${name}`);
    } catch (error) {
      logger.warn(
        { err: error },
        `Chess rating emoji not created | name = ${name}`
      );
    }
  }

  const missing = EMOJI_NAMES.filter((name) => !found.has(name));
  if (missing.length > 0) {
    const present = EMOJI_NAMES.filter((name) => found.has(name));
    unavailable(
      `missing application emojis [${missing.join(", ")}]; ` +
        `found [${present.join(", ")}]`
    );
  }

  return Object.fromEntries(
    RATING_ORDER.map((rating) => [rating, found.get(RATING_ASSETS[rating])!])
  ) as RatingEmojis;
}

class RatingEmojisService implements Service {
  private loaded: RatingEmojis | null = null;

  /** The rating's emoji, or its text badge until the emojis are loaded. */
  get(rating: Classification): string {
    return (this.loaded ?? TEXT_BADGES)[rating];
  }

  set(emojis: RatingEmojis): void {
    this.loaded = emojis;
  }

  /**
   * Loads the emojis unless they already are. A failure is logged, not thrown:
   * a module whose `onLoad` throws is dropped, and `/privacy delete` would then
   * skip the watches it stores.
   */
  async ensure(client: Client): Promise<boolean> {
    if (this.loaded) return true;
    try {
      this.set(await loadRatingEmojis(client));
      return true;
    } catch (err) {
      logger.warn(
        { err },
        "Chess rating emojis unavailable, text badges shown"
      );
      return false;
    }
  }
}

export default declareService(new RatingEmojisService());
