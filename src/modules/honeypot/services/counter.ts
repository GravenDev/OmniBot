import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Guild,
  type GuildTextBasedChannel,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import prisma from "#lib/database.js";
import { isApiError } from "#lib/discord-errors.js";
import type { TFunction } from "#lib/i18n.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { HoneypotConfigSchema } from "#modules/honeypot/honeypot.config.js";

type Config = ConfigProvider<HoneypotConfigSchema>;

const HONEY_COLOR = 0xf5a623;

const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

const logger = loggerMaker("honeypot");

const queue = new KeyedQueue();

const pending = new Map<string, number>();

interface Counter {
  count: number;
  channelId: string | null;
  messageId: string | null;
}

export function counterEmbed(
  t: TFunction,
  count: number,
  lastAt: Date
): EmbedBuilder {
  const when = `<t:${Math.floor(lastAt.getTime() / 1000)}:R>`;
  return new EmbedBuilder()
    .setColor(HONEY_COLOR)
    .setTitle(t("counter.title"))
    .setDescription(
      `${t("counter.count", { count })}\n${t("counter.last", { when })}`
    )
    .setFooter({ text: t("counter.footer") });
}

async function postCounter(
  channel: GuildTextBasedChannel,
  counter: Counter,
  embed: EmbedBuilder
): Promise<string> {
  if (counter.channelId === channel.id && counter.messageId) {
    try {
      await channel.messages.edit(counter.messageId, { embeds: [embed] });
      return counter.messageId;
    } catch (error) {
      if (!isApiError(error, RESTJSONErrorCodes.UnknownMessage)) {
        throw error;
      }
    }
  }
  const sent = await channel.send({
    embeds: [embed],
    allowedMentions: NO_MENTIONS,
    flags: MessageFlags.SuppressNotifications,
  });
  return sent.id;
}

async function removeStale(guild: Guild, counter: Counter): Promise<void> {
  if (!counter.channelId || !counter.messageId) {
    return;
  }
  const channel = guild.channels.cache.get(counter.channelId);
  if (!channel?.isTextBased()) {
    return;
  }
  await channel.messages.delete(counter.messageId).catch(() => undefined);
}

async function saveMessage(
  guild: Guild,
  channelId: string | null,
  messageId: string | null
): Promise<void> {
  await prisma.honeypotCounter.update({
    where: { guildId: guild.id },
    data: { channelId, messageId },
  });
}

async function flush(guild: Guild, config: Config): Promise<void> {
  const catches = pending.get(guild.id) ?? 0;
  pending.delete(guild.id);
  const lastAt = new Date();
  const counter = await prisma.honeypotCounter.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, count: catches, lastAt },
    update: { count: { increment: catches }, lastAt },
  });
  const channel = config.get("counterChannel");
  if (!channel) {
    if (counter.messageId) {
      await removeStale(guild, counter);
      await saveMessage(guild, null, null);
    }
    return;
  }
  if (!channel.isSendable() || channel.isDMBased()) {
    return;
  }
  const me = guild.members.me;
  if (me && !channel.permissionsFor(me).has(REQUIRED_PERMISSIONS)) {
    return;
  }
  const messageId = await postCounter(
    channel,
    counter,
    counterEmbed(config.t, counter.count, lastAt)
  );
  if (messageId === counter.messageId && channel.id === counter.channelId) {
    return;
  }
  try {
    await saveMessage(guild, channel.id, messageId);
  } catch (error) {
    await channel.messages.delete(messageId).catch(() => undefined);
    throw error;
  }
  if (counter.channelId !== channel.id) {
    await removeStale(guild, counter);
  }
}

export function recordCatch(guild: Guild, config: Config): Promise<void> {
  const waiting = pending.get(guild.id);
  pending.set(guild.id, (waiting ?? 0) + 1);
  if (waiting !== undefined) {
    return Promise.resolve();
  }
  return queue
    .run(guild.id, () => flush(guild, config))
    .catch((error: unknown) => {
      logger.warn(
        { err: error, guildId: guild.id },
        "Honeypot counter could not be updated"
      );
    });
}
