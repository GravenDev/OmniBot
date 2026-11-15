import {
  type Attachment,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  type Embed,
  escapeMarkdown,
  type Message,
  MessageType,
  RESTJSONErrorCodes,
  StickerFormatType,
  time,
  TimestampStyles,
} from "discord.js";
import { isApiError } from "./discord-errors.js";
import { COMPONENTS_TEXT_LIMIT } from "./format.js";
import type { TFunction } from "./i18n.js";
import { loggerMaker } from "./logger.js";
import {
  componentsMedia,
  componentsText,
  hiddenAttachments,
} from "./message-content.js";
import { quoteEachLine, stripLineMarkup, truncate } from "./text.js";

// The layout shared by the modules that report someone else's message in a
// message of their own (the quotes, the starboard): a container with the
// author, the channel and the date in small text above the message's text,
// the author's avatar beside them, its media in a gallery, then a separator
// and the module's own line beside a link to the message (above it, with the
// module's buttons, when it has some). A message that replies to another
// quotes it under the header, beside the avatar, and shows its own text
// below, at full width.

const logger = loggerMaker("reported-message");

const GALLERY_LIMIT = 10;
const EXTRAS_LIMIT = 1200;
const REPLY_LIMIT = 150;
const EMBED_LIMIT = 400;
const FILE_NAME_LIMIT = 60;
const SHOWN_EMBEDS = 2;
const SHOWN_FILES = 3;
const HEADER_GAP = "\n\n";

export interface ReportOptions {
  /** The container's accent colour; none when null. */
  accent: number | null;
  /**
   * The module's own line: beside the link to the message, or above it and
   * the module's buttons when there are some.
   */
  footer: string;
  /** The module's buttons, after the link to the message. */
  buttons?: ButtonBuilder[];
  /** The message it replies to, quoted under the header. */
  reply?: Message | null;
  /** The text the whole container may hold, its share of the message's. */
  textLimit?: number;
  /** The most of the message's own text shown. */
  contentLimit?: number;
  /** Shown instead of the text when the message has nothing to read. */
  emptyText?: string;
  /** False leaves the gallery out (when Discord refused one of its media). */
  withMedia?: boolean;
}

type Body = Pick<
  Message,
  "content" | "attachments" | "embeds" | "stickers" | "components"
>;

interface GalleryItem {
  url: string;
  spoiler: boolean;
}

function isMedia(attachment: Attachment): boolean {
  const type = attachment.contentType ?? "";
  return type.startsWith("image/") || type.startsWith("video/");
}

function bodyOf(message: Message): { body: Body; forwarded: boolean } {
  const snapshot = message.messageSnapshots.first();
  if (!message.content && message.attachments.size === 0 && snapshot) {
    return { body: snapshot, forwarded: true };
  }
  return { body: message, forwarded: false };
}

/** What the message reads: its content, or the text of its components. */
function textOf(body: Body): string {
  return body.content || componentsText(body);
}

const SPOILER = /\|\|([\s\S]+?)\|\|/g;

/**
 * A link preview to keep hidden: its link, or one of its media, is under a
 * spoiler; or the text has a spoiler and the preview's link is nowhere in the
 * clear. Discord rewrites links (short links, redirects, a trailing slash), so
 * a spoilered link may not match its preview's: when in doubt, it stays hidden.
 */
function isSpoilered(embed: Embed, text: string): boolean {
  const urls = [
    embed.url,
    embed.image?.url,
    embed.thumbnail?.url,
    embed.video?.url,
  ].filter((url): url is string => !!url);
  const spoilers = [...text.matchAll(SPOILER)];
  if (spoilers.length === 0) {
    return false;
  }
  if (
    spoilers.some(([, hidden]) => urls.some((url) => hidden!.includes(url)))
  ) {
    return true;
  }
  const clear = text.replace(SPOILER, "");
  return !urls.some((url) => clear.includes(url));
}

function embedText(embed: Embed): string | null {
  const parts = [
    // A title is plain text: its markup would spill onto the next lines.
    embed.title ? `**${escapeMarkdown(embed.title)}**` : null,
    embed.description,
  ].filter((part): part is string => !!part);
  return parts.length > 0
    ? truncate(quoteEachLine(parts.join("\n")), EMBED_LIMIT)
    : null;
}

function embedMedia(embed: Embed): string | undefined {
  switch (embed.data.type) {
    case "gifv":
      return embed.video?.url ?? embed.thumbnail?.url;
    case "image":
      return embed.image?.url ?? embed.thumbnail?.url;
    case "video":
      return embed.thumbnail?.url;
    // A link preview often carries its picture as a thumbnail only.
    case "article":
    case "link":
      return embed.image?.url ?? embed.thumbnail?.url;
    default:
      return embed.image?.url;
  }
}

function gallery(
  body: Body,
  text: string,
  hidden: ReadonlySet<string>
): GalleryItem[] {
  // A bot's embed may show one of its uploads (`attachment://`): once is
  // enough. Their links differ only by their signature.
  const path = (url: string) => url.split("?")[0];
  const uploads = new Set(body.attachments.map(({ url }) => path(url)));
  const embedItems: GalleryItem[] = [];
  for (const embed of body.embeds) {
    const url = embedMedia(embed);
    if (url && !uploads.has(path(url))) {
      embedItems.push({ url, spoiler: isSpoilered(embed, text) });
    }
  }
  return [
    ...body.attachments.filter(isMedia).map((attachment) => ({
      url: attachment.url,
      spoiler: attachment.spoiler || hidden.has(attachment.id),
    })),
    ...body.stickers
      .filter((sticker) => sticker.format !== StickerFormatType.Lottie)
      .map((sticker) => ({ url: sticker.url, spoiler: false })),
    ...embedItems,
  ];
}

function extras(
  body: Body,
  files: readonly Attachment[],
  hidden: ReadonlySet<string>,
  text: string,
  t: TFunction,
  limit: number,
  withMedia: boolean
): string {
  const lines: string[] = [];
  let length = 0;
  const add = (line: string): boolean => {
    if (length + line.length + 1 > limit) {
      return false;
    }
    lines.push(line);
    length += line.length + 1;
    return true;
  };
  const visible = body.embeds.filter((embed) => !isSpoilered(embed, text));
  for (const embed of visible.slice(0, SHOWN_EMBEDS)) {
    const quoted = embedText(embed);
    if (quoted) {
      add(quoted);
    }
  }
  for (const sticker of body.stickers.values()) {
    // Without the gallery, every sticker is named instead.
    if (sticker.format === StickerFormatType.Lottie || !withMedia) {
      add(t("reportedMessage.sticker", { name: escapeMarkdown(sticker.name) }));
    }
  }
  let shown = 0;
  for (const file of files.slice(0, SHOWN_FILES)) {
    // Brackets left as they are would close the link early. Backslashes are
    // escaped with them, then escapeMarkdown leaves them alone.
    const name = escapeMarkdown(
      truncate(file.name, FILE_NAME_LIMIT).replace(/[\\[\]]/g, "\\$&"),
      { escape: false }
    );
    const link = `📎 [${name}](${file.url})`;
    if (add(file.spoiler || hidden.has(file.id) ? `||${link}||` : link)) {
      shown++;
    }
  }
  if (files.length > shown) {
    add(t("reportedMessage.moreFiles", { count: files.length - shown }));
  }
  return lines.join("\n");
}

/**
 * The author, mentioned; a webhook's by name, its id being no user's. A slash
 * command's response also has a webhook id, but its author is the bot.
 */
function authorOf(message: Message): string {
  return message.webhookId && !message.interactionMetadata
    ? `**${escapeMarkdown(message.author.username)}**`
    : `<@${message.author.id}>`;
}

function replyLine(reply: Message, t: TFunction): string {
  const excerpt = truncate(
    stripLineMarkup(textOf(bodyOf(reply).body))
      .replace(/\s+/g, " ")
      .trim(),
    REPLY_LIMIT
  );
  return quoteEachLine(
    `-# ${t("reportedMessage.reply", {
      author: authorOf(reply),
      excerpt: excerpt || "…",
    })}`
  );
}

/**
 * Whether `channelId` is the message's channel or, in a thread, its parent's,
 * where the thread's starter message sits: whoever reads a thread reads its
 * parent, so the checks made on the message's channel hold there too.
 */
function isOwnChannel(message: Message, channelId: string | undefined) {
  return (
    channelId === message.channelId ||
    (message.channel.isThread() && channelId === message.channel.parentId)
  );
}

/**
 * The message `message` replies to, for `ReportOptions.reply`; null when it
 * replies to none, or when that one is gone or out of reach. It is never
 * looked for outside the message's channel (see `isOwnChannel`).
 */
export async function repliedTo(message: Message): Promise<Message | null> {
  try {
    if (
      message.type !== MessageType.Reply ||
      !isOwnChannel(message, message.reference?.channelId)
    ) {
      return null;
    }
    return await message.fetchReference();
  } catch (err) {
    // Gone, or out of reach (the channel no longer cached): the report goes
    // without it.
    logger.debug(
      { err },
      `Replied-to message unavailable | channelId = ${message.channelId} | messageId = ${message.id}`
    );
    return null;
  }
}

/**
 * The media a message laid out with components shows through them, each
 * hidden by its own spoiler or by its upload's.
 */
function shownMedia(raw: Body, hidden: ReadonlySet<string>) {
  return componentsMedia(raw).map((item) => ({
    url: item.url,
    spoiler:
      item.spoiler ||
      (!!item.attachmentId &&
        (hidden.has(item.attachmentId) ||
          !!raw.attachments.get(item.attachmentId)?.spoiler)),
    id: item.attachmentId,
  }));
}

/**
 * The module's line with the link beside it; above a row of buttons instead
 * when the module adds its own, a section holding a single accessory.
 */
function addFooter(
  container: ContainerBuilder,
  footer: string,
  link: ButtonBuilder,
  extra: readonly ButtonBuilder[]
): void {
  if (extra.length > 0) {
    container.addTextDisplayComponents((display) => display.setContent(footer));
    container.addActionRowComponents((row) =>
      row.addComponents(link, ...extra)
    );
    return;
  }
  container.addSectionComponents((section) =>
    section
      .addTextDisplayComponents((display) => display.setContent(footer))
      .setButtonAccessory(link)
  );
}

/**
 * The small text above the message: author, channel and date, then whether
 * it was forwarded and what it replies to.
 */
function headerOf(
  message: Message<true>,
  forwarded: boolean,
  reply: Message | null,
  t: TFunction
): string {
  return [
    `-# ${t("reportedMessage.header", {
      author: authorOf(message),
      channel: `<#${message.channelId}>`,
      sentAt: time(message.createdAt, TimestampStyles.RelativeTime),
    })}`,
    forwarded ? `-# ${t("reportedMessage.forwarded")}` : null,
    reply ? replyLine(reply, t) : null,
  ]
    .filter((part): part is string => !!part)
    .join("\n");
}

/** The container reporting `message`, with the module's line and buttons. */
export function reportedMessage(
  message: Message<true>,
  t: TFunction,
  options: ReportOptions
): ContainerBuilder {
  const textLimit = options.textLimit ?? COMPONENTS_TEXT_LIMIT;
  const { body: raw, forwarded } = bodyOf(message);
  const text = textOf(raw);
  // A message laid out with components shows its uploads through them, and
  // sets their spoiler there: its galleries are shown as they are (the upload
  // once, hidden by either spoiler), its other uploads with that spoiler.
  const hidden = hiddenAttachments(raw);
  const shown = shownMedia(raw, hidden);
  const shownIds = new Set(shown.map((item) => item.id));
  const body: Body = {
    content: raw.content,
    attachments: raw.attachments.filter(
      (attachment) => !shownIds.has(attachment.id)
    ),
    embeds: raw.embeds,
    stickers: raw.stickers,
    components: raw.components,
  };
  const container = new ContainerBuilder();
  if (options.accent !== null) {
    container.setAccentColor(options.accent);
  }

  const header = headerOf(message, forwarded, options.reply ?? null, t);
  const link = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setURL(message.url)
    .setLabel(t("reportedMessage.jump"));
  const buttons = [link, ...(options.buttons ?? [])];
  // Whether Discord counts the buttons' labels in its limit is not said:
  // they are kept out of it.
  const labels = buttons.reduce(
    (sum, button) =>
      sum + ("label" in button.data ? (button.data.label?.length ?? 0) : 0),
    0
  );
  const remaining = textLimit - labels - header.length - options.footer.length;
  // Under a reply, the text has a display of its own, at full width;
  // otherwise it follows the header in the section, beside the avatar.
  const textInSection = !options.reply;
  // The message's own text goes first: the extras get at most half of what
  // is left, or all of it when the message has no text.
  const withMedia = options.withMedia !== false;
  // Without the gallery, every upload is listed as a file instead.
  const files = withMedia
    ? [...body.attachments.values()].filter(
        (attachment) => !isMedia(attachment)
      )
    : [...raw.attachments.values()];
  const others = extras(
    body,
    files,
    hidden,
    text,
    t,
    Math.max(
      0,
      text ? Math.min(EXTRAS_LIMIT, Math.floor(remaining / 2)) : remaining
    ),
    withMedia
  );
  const budget = Math.min(
    options.contentLimit ?? Infinity,
    remaining - others.length - (textInSection ? HEADER_GAP.length : 0)
  );
  const media = !withMedia
    ? []
    : [...gallery(body, text, hidden), ...shown].slice(0, GALLERY_LIMIT);
  // Nothing to read nor to see: say so rather than show a bare header.
  const said =
    text || (others || media.length > 0 ? "" : (options.emptyText ?? ""));
  const shownText = said && budget >= 1 ? truncate(said, budget) : "";
  const sectionText =
    shownText && textInSection ? `${header}${HEADER_GAP}${shownText}` : header;
  const belowText = textInSection ? "" : shownText;
  const avatar =
    message.member?.displayAvatarURL() ?? message.author.displayAvatarURL();
  container.addSectionComponents((section) =>
    section
      .addTextDisplayComponents((display) => display.setContent(sectionText))
      .setThumbnailAccessory((thumbnail) => thumbnail.setURL(avatar))
  );
  if (belowText) {
    container.addTextDisplayComponents((display) =>
      display.setContent(belowText)
    );
  }

  if (others) {
    container.addTextDisplayComponents((display) => display.setContent(others));
  }

  if (media.length > 0) {
    container.addMediaGalleryComponents((mediaGallery) =>
      mediaGallery.addItems(
        ...media.map(({ url, spoiler }) => ({ media: { url }, spoiler }))
      )
    );
  }

  container.addSeparatorComponents((separator) => separator.setDivider(true));
  addFooter(container, options.footer, link, options.buttons ?? []);
  return container;
}

/**
 * Sends a report, then again without its media when Discord refuses the
 * message: a link's media it cannot show refuses the whole message.
 */
export async function sendWithMediaFallback<T>(
  send: (withMedia: boolean) => Promise<T>,
  onRetry: (err: unknown) => void
): Promise<T> {
  try {
    return await send(true);
  } catch (err) {
    if (!isApiError(err, RESTJSONErrorCodes.InvalidFormBodyOrContentType)) {
      throw err;
    }
    onRetry(err);
    return send(false);
  }
}
