import {
  AttachmentBuilder,
  type Collection,
  EmbedBuilder,
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
  const characters = Array.from(text);
  return characters.length <= limit
    ? text
    : `${characters.slice(0, limit - 1).join("")}…`;
}

export function isAuthoredByMember(message: Message): boolean {
  return !message.author.bot && !message.webhookId && !message.system;
}

function timestamp(message: Message): string {
  return `<t:${Math.floor(message.createdTimestamp / 1000)}:f>`;
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

export function deletedEmbed(
  message: Message,
  t: TFunction,
  deletedBy: string | null
): EmbedBuilder {
  const header = [
    `**${t("deleted.title", {
      author: `<@${message.author.id}>`,
      channel: `<#${message.channelId}>`,
    })}**`,
    t("sentAt", { sentAt: timestamp(message) }),
  ];
  if (deletedBy) {
    header.push(t("deleted.by", { moderator: `<@${deletedBy}>` }));
  }
  const body = [message.content, ...attachmentLines(message)].filter(Boolean);
  const description = [header.join("\n"), body.join("\n")]
    .filter(Boolean)
    .join("\n\n");

  return baseEmbed(message, DELETED_COLOR)
    .setDescription(truncate(description, DESCRIPTION_LIMIT))
    .setFooter(footer(message, t));
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
    .addFields(
      { name: t("edited.before"), value: content(before) },
      { name: t("edited.after"), value: content(after) }
    )
    .setFooter(footer(before, t));

  const tooLong = [before, after].some(
    (message) => Array.from(message.content).length > FIELD_LIMIT
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
    .join(" ");
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
