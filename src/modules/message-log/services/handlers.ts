import type {
  AttachmentBuilder,
  Collection,
  EmbedBuilder,
  GuildTextBasedChannel,
  Message,
  PartialMessage,
  ReadonlyCollection,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import { type DeleterLookup, findDeleter } from "./audit.js";
import {
  bulkDeleteLog,
  deletedLog,
  editedLog,
  isAuthoredByMember,
} from "./entries.js";
import { type LogTarget, logTargetFor } from "./routing.js";

type Config = ConfigProvider<MessageLogConfigSchema>;
type AnyMessage = Message | PartialMessage;

async function send(
  target: LogTarget,
  log: { embeds: EmbedBuilder[]; files: AttachmentBuilder[] }
): Promise<void> {
  await target.channel.send({
    embeds: log.embeds,
    files: target.withFiles ? log.files : [],
    allowedMentions: NO_MENTIONS,
  });
}

export async function logDeletion(
  message: AnyMessage,
  config: Config,
  lookupDeleter: DeleterLookup = findDeleter
): Promise<void> {
  if (message.partial || !message.inGuild() || !isAuthoredByMember(message)) {
    return;
  }
  const target = logTargetFor(message.channel, config);
  if (!target) {
    return;
  }
  const deletedBy = await lookupDeleter(
    message.guild,
    message.author.id,
    message.channelId
  );
  await send(
    target,
    deletedLog(message, config.t, deletedBy, target.withContent)
  );
}

export async function logBulkDeletion(
  messages:
    | ReadonlyCollection<string, AnyMessage>
    | Collection<string, AnyMessage>,
  channel: GuildTextBasedChannel,
  config: Config
): Promise<void> {
  const target = logTargetFor(channel, config);
  if (!target) {
    return;
  }
  await send(
    target,
    bulkDeleteLog(messages, channel.id, config.t, target.withContent)
  );
}

export async function logEdit(
  before: AnyMessage,
  after: AnyMessage,
  config: Config
): Promise<void> {
  if (
    !config.get("logEdits") ||
    before.partial ||
    after.partial ||
    !before.inGuild() ||
    !isAuthoredByMember(before) ||
    before.content === after.content
  ) {
    return;
  }
  const target = logTargetFor(before.channel, config);
  if (!target) {
    return;
  }
  await send(target, editedLog(before, after, config.t, target.withContent));
}
