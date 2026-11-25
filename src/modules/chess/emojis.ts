import type { Client } from "discord.js";
import type { Classification } from "wintrchess/classify";
import { loggerMaker } from "#lib/logger.js";
import { RATING_ASSETS, RATING_ORDER } from "./ratings.js";

const logger = loggerMaker("chess");

/** WintrChess rating emojis, keyed by classification. */
export type RatingEmojis = Record<Classification, string>;

let loaded: RatingEmojis | null = null;

export function setRatingEmojis(emojis: RatingEmojis): void {
  loaded = emojis;
}

export function ratingEmoji(rating: Classification): string {
  if (!loaded) throw new Error("Chess rating emojis are not loaded");
  return loaded[rating];
}

// The application emojis are named after the rating assets, without extension.
const EMOJI_NAMES = RATING_ORDER.map((rating) => RATING_ASSETS[rating]);

/** Warn and let `onLoad` fail: only this module is skipped, not the whole bot. */
function disable(reason: string, cause?: unknown): never {
  const message = `Chess module disabled: ${reason}`;
  if (cause === undefined) {
    logger.warn(message);
    throw new Error(message);
  }
  logger.warn({ err: cause }, message);
  throw new Error(message, { cause });
}

/**
 * Application emojis are named exactly after the rating assets. A missing
 * emoji disables the module instead of sending broken markup; the error lists
 * both the missing and the found names to make setup obvious.
 */
export async function loadRatingEmojis(client: Client): Promise<RatingEmojis> {
  if (!client.application) {
    disable("no Discord application available");
  }

  let emojis;
  try {
    emojis = await client.application.emojis.fetch();
  } catch (error) {
    disable("cannot fetch application emojis", error);
  }

  const found = new Map(
    emojis.map((emoji) => [emoji.name, emoji.toString()] as const)
  );
  const missing = EMOJI_NAMES.filter((name) => !found.has(name));
  if (missing.length > 0) {
    const present = EMOJI_NAMES.filter((name) => found.has(name));
    disable(
      `missing application emojis [${missing.join(", ")}]; ` +
        `found [${present.join(", ")}]`
    );
  }

  return Object.fromEntries(
    RATING_ORDER.map((rating) => [rating, found.get(RATING_ASSETS[rating])!])
  ) as RatingEmojis;
}
