import { DiscordAPIError } from "discord.js";
import type { loggerMaker } from "./logger.js";

type Logger = ReturnType<typeof loggerMaker>;

/**
 * Draws a card and posts it. False when it could not be drawn or Discord
 * refused it (no permission to attach files, say): the caller then posts its
 * text instead, which says the same, so that the day is still announced. Any
 * other error from `post` is thrown: it may come after Discord posted the
 * card, and the text would repeat it. `what` ends the log lines ("the
 * birthdays | guildId = …").
 */
export async function postCard<T>(
  logger: Logger,
  what: string,
  draw: () => Promise<T>,
  post: (card: T) => Promise<unknown>
): Promise<boolean> {
  let card: T;
  try {
    card = await draw();
  } catch (err) {
    logger.error({ err }, `Card not drawn, posting text: ${what}`);
    return false;
  }
  try {
    await post(card);
    return true;
  } catch (err) {
    if (!(err instanceof DiscordAPIError)) {
      throw err;
    }
    logger.warn({ err }, `Card refused, posting text: ${what}`);
    return false;
  }
}
