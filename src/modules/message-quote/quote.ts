import {
  type ContainerBuilder,
  type GuildMember,
  type Message,
  MessageFlags,
} from "discord.js";
import { COMPONENTS_TEXT_LIMIT } from "#lib/format.js";
import { stripHiddenText } from "#lib/hidden-text.js";
import type { TFunction } from "#lib/i18n.js";
import { NO_MENTIONS_REPLY } from "#lib/mentions.js";
import { forEachComponent } from "#lib/message-content.js";
import { type ReportOptions, reportedMessage } from "#lib/reported-message.js";
import {
  deleteButton,
  QUOTE_CUSTOM_ID,
} from "#modules/message-quote/interactions/delete.button.js";

export const MAX_QUOTES = 3;

// A soft lavender, for a quoted member without a role colour.
export const ACCENT = 0xa0a4ff;

const LINK_PATTERN =
  /(<)?https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)(>)?/g;

export interface MessageLink {
  channelId: string;
  messageId: string;
}

/** A quoted message, and the one it replies to, quoted under its header. */
export interface Quote {
  message: Message<true>;
  reply: Message | null;
}

export function parseMessageLinks(
  content: string,
  guildId: string
): MessageLink[] {
  const links: MessageLink[] = [];
  const seen = new Set<string>();
  for (const match of stripHiddenText(content).matchAll(LINK_PATTERN)) {
    const [, open, linkGuildId, channelId, messageId, close] = match;
    if (
      !channelId ||
      !messageId ||
      (open && close) ||
      linkGuildId !== guildId ||
      seen.has(messageId)
    ) {
      continue;
    }
    seen.add(messageId);
    links.push({ channelId, messageId });
    if (links.length === MAX_QUOTES) {
      break;
    }
  }
  return links;
}

// A quote is a container with the delete button inside; an older one, an
// embed with the button in an action row below it.
export function isOwnQuote(quoted: Message<true>): boolean {
  if (quoted.author.id !== quoted.client.user.id) {
    return false;
  }
  let found = false;
  forEachComponent(quoted, (node) => {
    found ||= !!node.custom_id?.startsWith(`${QUOTE_CUSTOM_ID}:`);
  });
  return found;
}

/** The quote's container: the quoted message, then who quoted it. */
export function quoteContainer(
  quoted: Message<true>,
  quoter: GuildMember,
  t: TFunction,
  options: Pick<
    ReportOptions,
    "reply" | "textLimit" | "buttons" | "withMedia"
  > = {}
): ContainerBuilder {
  return reportedMessage(quoted, t, {
    accent: quoted.member?.displayColor || ACCENT,
    footer: `-# ${t("quote.by", { quoter: `<@${quoter.id}>` })}`,
    emptyText: t("quote.noContent"),
    ...options,
  });
}

/**
 * The reply quoting `quotes`, one container each, sharing Discord's text
 * limit; the last one carries the delete button, for the people involved.
 */
export function quoteReply(
  quotes: readonly Quote[],
  quoter: GuildMember,
  t: TFunction,
  withMedia = true
) {
  const textLimit = Math.floor(COMPONENTS_TEXT_LIMIT / quotes.length);
  const allowedUserIds = [
    quoter.id,
    ...quotes.map(({ message }) => message.author.id),
  ];
  return {
    components: quotes.map(({ message, reply }, index) =>
      quoteContainer(message, quoter, t, {
        reply,
        textLimit,
        withMedia,
        buttons:
          index === quotes.length - 1 ? [deleteButton(t, allowedUserIds)] : [],
      })
    ),
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: NO_MENTIONS_REPLY,
  };
}
