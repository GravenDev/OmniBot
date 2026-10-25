import {
  EmbedBuilder,
  escapeMarkdown,
  PermissionFlagsBits,
  type Message,
} from "discord.js";
import { widensAudience } from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import { formatDuration } from "#lib/duration.js";
import type { TFunction } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { truncate } from "#lib/text.js";
import type { HoneypotConfigSchema } from "#modules/honeypot/honeypot.config.js";
import type { TrapResult } from "./trap.js";

const SANCTIONED_COLOR = 0xed4245;
const FAILED_COLOR = 0xfaa61a;
const DESCRIPTION_LIMIT = 4096;

const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

const logger = loggerMaker("honeypot");

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
    ...(message.content ? inert(message.content).split("\n") : []),
    ...[...message.attachments.values()].map(
      (attachment) => `📎 ${inert(attachment.name)}`
    ),
  ];
  return lines.length
    ? lines.map((line) => `> ${line}`).join("\n")
    : t("log.empty");
}

export function trapLog(
  message: Message<true>,
  t: TFunction,
  result: TrapResult,
  purgeSeconds: number,
  withContent: boolean
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
  const body = withContent ? quoted(message, t) : t("log.hidden");
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

export async function logTrap(
  message: Message<true>,
  config: ConfigProvider<HoneypotConfigSchema>,
  result: TrapResult,
  purgeSeconds: number
): Promise<void> {
  const channel = config.get("logChannel");
  if (!channel?.isSendable() || channel.isDMBased()) {
    return;
  }
  const me = channel.guild.members.me;
  if (me && !channel.permissionsFor(me).has(REQUIRED_PERMISSIONS)) {
    return;
  }
  try {
    await channel.send({
      embeds: [
        trapLog(
          message,
          config.t,
          result,
          purgeSeconds,
          !widensAudience(message.channel, channel)
        ),
      ],
      allowedMentions: NO_MENTIONS,
    });
  } catch (error) {
    logger.warn(
      { err: error, guildId: message.guildId },
      "Honeypot log could not be posted"
    );
  }
}
