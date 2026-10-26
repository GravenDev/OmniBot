import {
  AttachmentBuilder,
  EmbedBuilder,
  time,
  TimestampStyles,
  type Collection,
  type Message,
  type PartialMessage,
  type ReadonlyCollection,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";

const DELETED_COLOR = 0xed4245;
const EDITED_COLOR = 0xfaa61a;
const DESCRIPTION_LIMIT = 4096;
const FIELD_LIMIT = 1024;

type AnyMessage = Message | PartialMessage;

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  let kept = "";
  for (const character of text) {
    if (kept.length + character.length > limit - 1) {
      break;
    }
    kept += character;
  }
  return `${kept}…`;
}

export function isAuthoredByMember(message: Message): boolean {
  return !message.author.bot && !message.webhookId && !message.system;
}

function attachmentLines(message: Message): string[] {
  return [...message.attachments.values()].map(
    (attachment) => `📎 ${attachment.name}`
  );
}

function baseEmbed(message: Message, color: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: message.author.username,
      iconURL: message.author.displayAvatarURL(),
    })
    .setTimestamp();
}

function footer(message: Message, t: TFunction) {
  return {
    text: t("footer", { authorId: message.author.id, messageId: message.id }),
  };
}

function quoteBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function deletedDescription(
  message: Message,
  t: TFunction,
  deletedBy: string | null
): string {
  const header = [
    `**${t("deleted.title", {
      author: `<@${message.author.id}>`,
      channel: `<#${message.channelId}>`,
    })}**`,
    t("sentAt", {
      sentAt: time(
        new Date(message.createdTimestamp),
        TimestampStyles.ShortDateTime
      ),
    }),
  ];
  if (deletedBy) {
    header.push(t("deleted.by", { moderator: `<@${deletedBy}>` }));
  }
  const body = [message.content, ...attachmentLines(message)].filter(Boolean);
  return [header.join("\n"), body.length > 0 ? quoteBlock(body.join("\n")) : ""]
    .filter(Boolean)
    .join("\n\n");
}

export function deletedEmbed(
  message: Message,
  t: TFunction,
  deletedBy: string | null
): EmbedBuilder {
  return baseEmbed(message, DELETED_COLOR)
    .setDescription(
      truncate(deletedDescription(message, t, deletedBy), DESCRIPTION_LIMIT)
    )
    .setFooter(footer(message, t));
}

export function deletedLog(
  message: Message,
  t: TFunction,
  deletedBy: string | null
) {
  const cut =
    deletedDescription(message, t, deletedBy).length > DESCRIPTION_LIMIT;
  const files = cut
    ? [
        new AttachmentBuilder(Buffer.from(message.content, "utf8"), {
          name: `deleted-${message.id}.txt`,
        }),
      ]
    : [];
  return {
    embeds: [deletedEmbed(message, t, deletedBy)],
    files,
  };
}

export function editedLog(before: Message, after: Message, t: TFunction) {
  const content = (message: Message) =>
    truncate(message.content || t("edited.empty"), FIELD_LIMIT);
  const embed = baseEmbed(before, EDITED_COLOR)
    .setDescription(
      [
        `**${t("edited.title", {
          author: `<@${before.author.id}>`,
          channel: `<#${before.channelId}>`,
        })}**`,
        t("edited.jump", { url: after.url }),
      ].join("\n")
    )
    .setFooter(footer(before, t));
  embed.addFields(
    { name: t("edited.before"), value: content(before) },
    { name: t("edited.after"), value: content(after) }
  );

  const tooLong = [before, after].some(
    (message) => message.content.length > FIELD_LIMIT
  );
  const files = tooLong
    ? [
        new AttachmentBuilder(
          Buffer.from(
            [
              `${t("edited.before")}:`,
              before.content,
              "",
              `${t("edited.after")}:`,
              after.content,
            ].join("\n"),
            "utf8"
          ),
          { name: `edit-${before.id}.txt` }
        ),
      ]
    : [];

  return { embeds: [embed], files };
}

function transcriptLine(message: Message): string {
  const sentAt = new Date(message.createdTimestamp).toISOString();
  const content = [message.content, ...attachmentLines(message)]
    .filter(Boolean)
    .join(" ")
    .replaceAll("\n", "\n    ");
  return `[${sentAt}] ${message.author.username} (${message.author.id}): ${content}`;
}

export function bulkDeleteLog(
  messages:
    | ReadonlyCollection<string, AnyMessage>
    | Collection<string, AnyMessage>,
  channelId: string,
  t: TFunction
) {
  const known = [...messages.values()]
    .filter(
      (message): message is Message =>
        !message.partial && isAuthoredByMember(message)
    )
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = [
    `**${t("bulk.title", {
      count: messages.size,
      channel: `<#${channelId}>`,
    })}**`,
  ];
  if (known.length > 0) {
    lines.push(t("bulk.known", { count: known.length }));
  }
  const embed = new EmbedBuilder()
    .setColor(DELETED_COLOR)
    .setDescription(lines.join("\n"))
    .setTimestamp();

  const files =
    known.length > 0
      ? [
          new AttachmentBuilder(
            Buffer.from(known.map(transcriptLine).join("\n"), "utf8"),
            { name: `deleted-${channelId}.txt` }
          ),
        ]
      : [];

  return { embeds: [embed], files };
}
