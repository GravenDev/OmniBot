import {
  DiscordAPIError,
  MediaGalleryBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type AttachmentBuilder,
} from "discord.js";
import { COMPONENTS_TEXT_LIMIT } from "./format.js";
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
    logger.warn(
      { err },
      `Card refused, posting text: ${what} | code = ${err.code}`
    );
    return false;
  }
}

/**
 * The text a celebration's mentions may take in one message: the components'
 * limit, less a heading and the card's alternative text (1024 at most), should
 * Discord count them in it.
 */
export const CELEBRATION_TEXT_LIMIT = COMPONENTS_TEXT_LIMIT - 100 - 1024;

export interface Celebration {
  /** Above the card: what is celebrated. */
  heading?: string;
  /** Shown full width, with its alternative text. */
  card?: AttachmentBuilder;
  /** Under the card: whom, with their mentions. */
  text?: string;
  /** Mentions that notify without a push notification. */
  silent?: boolean;
}

/**
 * A celebration laid out with components and no frame: the heading, the card
 * full width, then the text, so that the party reads before the names. Its
 * mentions notify as the caller's `allowedMentions` say, in a text display as
 * in a message's content.
 */
export function celebrationMessage({
  heading,
  card,
  text,
  silent = false,
}: Celebration) {
  const components: (TextDisplayBuilder | MediaGalleryBuilder)[] = [];
  if (heading) {
    components.push(new TextDisplayBuilder().setContent(heading));
  }
  if (card) {
    if (!card.name) {
      // `attachment://null` would show a broken image, or be refused.
      throw new Error("A celebration card needs a file name");
    }
    components.push(
      new MediaGalleryBuilder().addItems((item) => {
        item.setURL(`attachment://${card.name}`);
        return card.description ? item.setDescription(card.description) : item;
      })
    );
  }
  if (text) {
    components.push(new TextDisplayBuilder().setContent(text));
  }
  return {
    components,
    ...(card && { files: [card] }),
    flags: silent
      ? MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications
      : MessageFlags.IsComponentsV2,
  } as const;
}
