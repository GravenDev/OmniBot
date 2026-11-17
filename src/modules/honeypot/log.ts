import { EmbedBuilder, escapeMarkdown, type Message } from "discord.js";
import { formatDuration } from "#lib/duration.js";
import type { TFunction } from "#lib/i18n.js";
import { quoteEachLine, truncate } from "#lib/text.js";
import type { TrapResult } from "./trap.js";

const SANCTIONED_COLOR = 0xed4245;
const FAILED_COLOR = 0xfaa61a;
const DESCRIPTION_LIMIT = 4096;

function inert(text: string): string {
  return escapeMarkdown(text, {
    heading: true,
    bulletedList: true,
    numberedList: true,
    maskedLink: true,
  });
}

function quoted(message: Message<true>, t: TFunction): string {
  const lines = [
    ...(message.content ? [inert(message.content)] : []),
    ...[...message.attachments.values()].map(
      (attachment) => `📎 ${inert(attachment.name)}`
    ),
  ];
  return lines.length ? quoteEachLine(lines.join("\n")) : t("log.empty");
}

export function trapLog(
  message: Message<true>,
  t: TFunction,
  result: TrapResult,
  purgeSeconds: number
): EmbedBuilder {
  const title = t("log.title", {
    author: `<@${message.author.id}>`,
    channel: `<#${message.channelId}>`,
  });
  const header = `**${title}**\n`;
  const footer = [
    t(`outcome.${result.outcome}`, { window: formatDuration(purgeSeconds) }),
    ...(result.messageKept ? [t("log.messageKept")] : []),
  ].join("\n");
  const body = quoted(message, t);
  const room = DESCRIPTION_LIMIT - header.length - footer.length - 2;
  return new EmbedBuilder()
    .setColor(result.outcome === "softbanned" ? SANCTIONED_COLOR : FAILED_COLOR)
    .setAuthor({
      name: message.author.username,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(`${header}${truncate(body, room)}\n\n${footer}`)
    .setFooter({ text: t("log.footer", { authorId: message.author.id }) })
    .setTimestamp();
}
