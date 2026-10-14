import type {
  Collection,
  GuildTextBasedChannel,
  Message,
  PartialMessage,
  ReadonlyCollection,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import { findDeleter } from "./audit.js";
import { bulkDeleteLog, deletedEmbed, editedEmbed } from "./entries.js";
import { logChannelFor } from "./routing.js";

type Config = ConfigProvider<MessageLogConfigSchema>;
type AnyMessage = Message | PartialMessage;

const NO_MENTIONS = { parse: [] };

function isIgnored(message: AnyMessage): boolean {
  return !!message.author?.bot || !!message.webhookId;
}

export async function logDeletion(
  message: AnyMessage,
  config: Config,
  lookupDeleter = findDeleter
): Promise<void> {
  if (!message.inGuild() || isIgnored(message)) {
    return;
  }
  const logChannel = logChannelFor(message.channel, config);
  if (!logChannel) {
    return;
  }
  const deletedBy = message.author
    ? await lookupDeleter(message.guild, message.author.id, message.channelId)
    : null;
  await logChannel.send({
    embeds: [deletedEmbed(message, config.t, deletedBy)],
    allowedMentions: NO_MENTIONS,
  });
}

export async function logBulkDeletion(
  messages:
    | ReadonlyCollection<string, AnyMessage>
    | Collection<string, AnyMessage>,
  channel: GuildTextBasedChannel,
  config: Config
): Promise<void> {
  const logChannel = logChannelFor(channel, config);
  if (!logChannel) {
    return;
  }
  await logChannel.send({
    ...bulkDeleteLog(messages, channel.id, config.t),
    allowedMentions: NO_MENTIONS,
  });
}

export async function logEdit(
  before: AnyMessage,
  after: AnyMessage,
  config: Config
): Promise<void> {
  if (
    !config.get("logEdits") ||
    before.partial ||
    !before.inGuild() ||
    isIgnored(before) ||
    after.partial ||
    before.content === after.content
  ) {
    return;
  }
  const logChannel = logChannelFor(before.channel, config);
  if (!logChannel) {
    return;
  }
  await logChannel.send({
    embeds: [editedEmbed(before, after, config.t)],
    allowedMentions: NO_MENTIONS,
  });
}
