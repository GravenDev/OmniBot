import {
  type Attachment,
  ButtonStyle,
  ContainerBuilder,
  type Embed,
  escapeMarkdown,
  type Message,
  MessageFlags,
  StickerFormatType,
  time,
  TimestampStyles,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { Tally } from "./tally.js";

const ACCENT = 0xf5c518;

const TEXT_LIMIT = 4000;
const CONTENT_LIMIT = 1500;
const EXTRAS_LIMIT = 1200;
const REPLY_LIMIT = 150;
const EMBED_LIMIT = 400;
const FILE_NAME_LIMIT = 60;
const SHOWN_EMBEDS = 2;
const SHOWN_FILES = 3;
const GALLERY_LIMIT = 10;

type Body = Pick<Message, "content" | "attachments" | "embeds" | "stickers">;

interface GalleryItem {
  url: string;
  spoiler: boolean;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
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

function embedText(embed: Embed): string | null {
  const parts = [
    embed.title ? `**${embed.title}**` : null,
    embed.description,
  ].filter((part): part is string => !!part);
  return parts.length > 0
    ? truncate(quote(parts.join("\n")), EMBED_LIMIT)
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
    default:
      return embed.image?.url;
  }
}

function gallery(body: Body): GalleryItem[] {
  const items: GalleryItem[] = [
    ...body.attachments.filter(isMedia).map((attachment) => ({
      url: attachment.url,
      spoiler: attachment.spoiler,
    })),
    ...body.stickers
      .filter((sticker) => sticker.format !== StickerFormatType.Lottie)
      .map((sticker) => ({ url: sticker.url, spoiler: false })),
    ...body.embeds
      .map(embedMedia)
      .filter((url): url is string => !!url)
      .map((url) => ({ url, spoiler: false })),
  ];
  return items.slice(0, GALLERY_LIMIT);
}

function extras(body: Body, t: TFunction): string {
  const lines: string[] = [];
  let length = 0;
  const add = (line: string): boolean => {
    if (length + line.length + 1 > EXTRAS_LIMIT) {
      return false;
    }
    lines.push(line);
    length += line.length + 1;
    return true;
  };
  for (const embed of body.embeds.slice(0, SHOWN_EMBEDS)) {
    const text = embedText(embed);
    if (text) {
      add(text);
    }
  }
  for (const sticker of body.stickers.values()) {
    if (sticker.format === StickerFormatType.Lottie) {
      add(t("sticker", { name: escapeMarkdown(sticker.name) }));
    }
  }
  const files = [...body.attachments.values()].filter(
    (attachment) => !isMedia(attachment)
  );
  let shown = 0;
  for (const file of files.slice(0, SHOWN_FILES)) {
    const name = escapeMarkdown(truncate(file.name, FILE_NAME_LIMIT));
    if (add(`📎 [${name}](${file.url})`)) {
      shown++;
    }
  }
  if (files.length > shown) {
    add(t("moreFiles", { count: files.length - shown }));
  }
  return lines.join("\n");
}

function replyLine(reply: Message, t: TFunction): string {
  const excerpt = truncate(
    reply.content.replace(/\s+/g, " ").trim(),
    REPLY_LIMIT
  );
  return `-# ${t("reply", {
    author: `<@${reply.author.id}>`,
    excerpt: excerpt || "…",
  })}`;
}

export function counterLine(
  tally: Tally,
  fallbackEmoji: string,
  t: TFunction
): string {
  const reactions =
    tally.reactions.length > 0
      ? tally.reactions
      : [{ emoji: fallbackEmoji, count: 0 }];
  const counts = reactions
    .map(({ emoji, count }) => `${emoji} **${count}**`)
    .join(" · ");
  return tally.reactions.length > 1
    ? `${counts} · ${t("total", { count: tally.total })}`
    : counts;
}

export function starboardMessage(
  message: Message<true>,
  reply: Message | null,
  tally: Tally,
  fallbackEmoji: string,
  t: TFunction
) {
  const { body, forwarded } = bodyOf(message);
  const container = new ContainerBuilder().setAccentColor(ACCENT);

  const replied = reply ? replyLine(reply, t) : null;
  if (replied) {
    container.addTextDisplayComponents((text) => text.setContent(replied));
  }

  const header = [
    t("header", {
      author: `<@${message.author.id}>`,
      channel: `<#${message.channelId}>`,
      sentAt: time(message.createdAt, TimestampStyles.RelativeTime),
    }),
    forwarded ? `-# ${t("forwarded")}` : null,
  ]
    .filter((part): part is string => !!part)
    .join("\n");
  const others = extras(body, t);
  const counter = counterLine(tally, fallbackEmoji, t);
  const budget =
    TEXT_LIMIT -
    (replied?.length ?? 0) -
    header.length -
    others.length -
    counter.length -
    1;
  const content = body.content
    ? `${header}\n${truncate(body.content, Math.min(CONTENT_LIMIT, budget))}`
    : header;
  const avatar =
    message.member?.displayAvatarURL() ?? message.author.displayAvatarURL();
  container.addSectionComponents((section) =>
    section
      .addTextDisplayComponents((text) => text.setContent(content))
      .setThumbnailAccessory((thumbnail) => thumbnail.setURL(avatar))
  );

  if (others) {
    container.addTextDisplayComponents((text) => text.setContent(others));
  }

  const media = gallery(body);
  if (media.length > 0) {
    container.addMediaGalleryComponents((mediaGallery) =>
      mediaGallery.addItems(
        ...media.map(({ url, spoiler }) => ({
          media: { url },
          spoiler,
        }))
      )
    );
  }

  container.addSeparatorComponents((separator) => separator.setDivider(true));
  container.addSectionComponents((section) =>
    section
      .addTextDisplayComponents((text) => text.setContent(counter))
      .setButtonAccessory((button) =>
        button
          .setStyle(ButtonStyle.Link)
          .setURL(message.url)
          .setLabel(t("jump"))
      )
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: NO_MENTIONS,
  };
}
