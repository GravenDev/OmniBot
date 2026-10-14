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

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function timestamp(message: AnyMessage): string {
  return `<t:${Math.floor(message.createdTimestamp / 1000)}:f>`;
}

function attachmentLines(message: AnyMessage): string[] {
  return [...message.attachments.values()].map(
    (attachment) => `📎 ${attachment.name}`
  );
}

function withAuthor(embed: EmbedBuilder, message: AnyMessage): EmbedBuilder {
  if (message.author) {
    embed.setAuthor({
      name: message.author.username,
      iconURL: message.author.displayAvatarURL(),
    });
  }
  return embed;
}

export function deletedEmbed(
  message: AnyMessage,
  t: TFunction,
  deletedBy: string | null
): EmbedBuilder {
  const header = [
    `**${t("deleted.title", {
      author: message.author ? `<@${message.author.id}>` : t("unknownAuthor"),
      channel: `<#${message.channelId}>`,
    })}**`,
    t("sentAt", { sentAt: timestamp(message) }),
  ];
  if (deletedBy) {
    header.push(t("deleted.by", { moderator: `<@${deletedBy}>` }));
  }
  const body = message.partial
    ? [t("deleted.unknownContent")]
    : [message.content, ...attachmentLines(message)].filter(Boolean);
  const description = [header.join("\n"), body.join("\n")]
    .filter(Boolean)
    .join("\n\n");

  return withAuthor(new EmbedBuilder(), message)
    .setColor(DELETED_COLOR)
    .setDescription(truncate(description, DESCRIPTION_LIMIT))
    .setFooter({
      text: message.author
        ? t("footer.full", {
            authorId: message.author.id,
            messageId: message.id,
          })
        : t("footer.message", { messageId: message.id }),
    })
    .setTimestamp();
}

export function editedEmbed(
  before: Message,
  after: AnyMessage,
  t: TFunction
): EmbedBuilder {
  const content = (message: AnyMessage) =>
    truncate(message.content || t("edited.empty"), FIELD_LIMIT);

  return withAuthor(new EmbedBuilder(), before)
    .setColor(EDITED_COLOR)
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
    .setFooter({
      text: t("footer.full", {
        authorId: before.author.id,
        messageId: before.id,
      }),
    })
    .setTimestamp();
}

function transcriptLine(message: Message): string {
  const sentAt = new Date(message.createdTimestamp).toISOString();
  const attachments = attachmentLines(message);
  const content = [message.content, ...attachments].filter(Boolean).join(" ");
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
    .filter((message): message is Message => !message.partial)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const embed = new EmbedBuilder()
    .setColor(DELETED_COLOR)
    .setDescription(
      [
        `**${t("bulk.title", {
          count: messages.size,
          channel: `<#${channelId}>`,
        })}**`,
        t("bulk.known", { count: known.length }),
      ].join("\n")
    )
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
