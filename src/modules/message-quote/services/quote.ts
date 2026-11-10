import {
  ChannelType,
  type ContainerBuilder,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import {
  excludedIdsOf,
  isExcluded,
  isNsfw,
  READ_PERMISSIONS,
} from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import { COMPONENTS_TEXT_LIMIT } from "#lib/format.js";
import { stripHiddenText } from "#lib/hidden-text.js";
import type { TFunction } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS_REPLY } from "#lib/mentions.js";
import { forEachComponent } from "#lib/message-content.js";
import {
  type ReportOptions,
  reportedMessage,
  sendWithMediaFallback,
} from "#lib/reported-message.js";
import {
  deleteButton,
  QUOTE_CUSTOM_ID,
} from "#modules/message-quote/interactions/delete.button.js";
import type { MessageQuoteConfigSchema } from "#modules/message-quote/message-quote.config.js";

const logger = loggerMaker("message-quote");

export const MAX_QUOTES = 3;

// A soft lavender, for a quoted member without a role colour.
export const ACCENT = 0xa0a4ff;

const LINK_PATTERN =
  /(<)?https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)(>)?/g;

export interface MessageLink {
  channelId: string;
  messageId: string;
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
function isOwnQuote(quoted: Message<true>): boolean {
  if (quoted.author.id !== quoted.client.user.id) {
    return false;
  }
  let found = false;
  forEachComponent(quoted, (node) => {
    found ||= !!node.custom_id?.startsWith(`${QUOTE_CUSTOM_ID}:`);
  });
  return found;
}

export async function canRead(
  member: GuildMember,
  channel: GuildBasedChannel
): Promise<boolean> {
  const permissions = channel.permissionsFor(member);
  if (!permissions?.has(READ_PERMISSIONS)) {
    return false;
  }
  if (
    channel.type !== ChannelType.PrivateThread ||
    permissions.has(PermissionFlagsBits.ManageThreads)
  ) {
    return true;
  }
  return (
    (await channel.members
      .fetch({ member: member.id, force: true, cache: false })
      .catch(() => null)) !== null
  );
}

export async function resolveQuote(
  source: Message<true>,
  member: GuildMember,
  link: MessageLink,
  excludedIds: ReadonlySet<string>
): Promise<Message<true> | null> {
  const channel = await source.guild.channels
    .fetch(link.channelId)
    .catch(() => null);
  const skip = (reason: string): null => {
    logger.debug(
      `Quote skipped | reason = ${reason} | guildId = ${source.guildId} | channelId = ${link.channelId} | messageId = ${link.messageId} | userId = ${member.id}`
    );
    return null;
  };
  if (!channel?.isTextBased()) {
    return skip("channel not found or not text");
  }
  if (isExcluded(channel, excludedIds)) {
    return skip("excluded channel");
  }
  if (isNsfw(channel) && !isNsfw(source.channel)) {
    return skip("nsfw channel quoted from a non-nsfw channel");
  }
  if (!(await canRead(member, channel))) {
    return skip("quoter cannot read the channel");
  }
  const quoted = await channel.messages.fetch(link.messageId).catch(() => null);
  if (!quoted) {
    return skip("message not found");
  }
  return isOwnQuote(quoted) ? skip("message is already a quote") : quoted;
}

/** The quote's container: the quoted message, then who quoted it. */
export function quoteContainer(
  quoted: Message<true>,
  quoter: GuildMember,
  t: TFunction,
  options: Pick<ReportOptions, "textLimit" | "buttons" | "withMedia"> = {}
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
  quotes: Message<true>[],
  quoter: GuildMember,
  t: TFunction,
  withMedia = true
) {
  const textLimit = Math.floor(COMPONENTS_TEXT_LIMIT / quotes.length);
  const allowedUserIds = [
    quoter.id,
    ...quotes.map((quoted) => quoted.author.id),
  ];
  return {
    components: quotes.map((quoted, index) =>
      quoteContainer(quoted, quoter, t, {
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

export async function quoteLinks(
  message: Message<true>,
  config: ConfigProvider<MessageQuoteConfigSchema>
): Promise<void> {
  const links = parseMessageLinks(message.content, message.guildId);
  if (links.length === 0) {
    return;
  }

  const excludedIds = excludedIdsOf(
    config.get("excludedChannels"),
    config.get("excludedCategories")
  );
  if (isExcluded(message.channel, excludedIds)) {
    logger.debug(
      `Quote ignored | reason = excluded channel | guildId = ${message.guildId} | channelId = ${message.channelId}`
    );
    return;
  }

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    logger.debug(
      `Quote ignored | reason = author not resolvable | guildId = ${message.guildId} | userId = ${message.author.id}`
    );
    return;
  }

  const quotes = (
    await Promise.all(
      links.map((link) => resolveQuote(message, member, link, excludedIds))
    )
  ).filter((quoted) => quoted !== null);
  if (quotes.length === 0) {
    logger.debug(
      `Quote ignored | reason = no quotable link | guildId = ${message.guildId} | channelId = ${message.channelId} | messageId = ${message.id} | links = ${links.length}`
    );
    return;
  }

  const send = (withMedia: boolean) => {
    const reply = quoteReply(quotes, member, config.t, withMedia);
    return message.reply({
      ...reply,
      failIfNotExists: false,
      // The message with the link already notified the channel: no second
      // push.
      flags: reply.flags | MessageFlags.SuppressNotifications,
    });
  };
  await sendWithMediaFallback(send, (err) =>
    logger.warn(
      { err },
      `Quote refused by Discord, retrying without media | guildId = ${message.guildId} | messageId = ${message.id}`
    )
  );
}
