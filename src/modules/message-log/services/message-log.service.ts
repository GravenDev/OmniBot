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
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { declareService, type Service } from "#lib/service.js";
import {
  bulkDeleteLog,
  deletedLog,
  editedLog,
  isAuthoredByMember,
} from "#modules/message-log/entries.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import { type LogTarget, logTargetFor } from "#modules/message-log/routing.js";
import deleterFinder, { type DeleterLookup } from "./audit.service.js";

const logger = loggerMaker("message-log");

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

class MessageLogService implements Service {
  async logDeletion(
    message: AnyMessage,
    config: Config,
    lookupDeleter: DeleterLookup = deleterFinder.find
  ): Promise<void> {
    if (message.partial || !message.inGuild() || !isAuthoredByMember(message)) {
      logger.debug(
        `Deletion not logged | reason = ${message.partial ? "uncached message" : "not authored by a member"} | messageId = ${message.id} | channelId = ${message.channelId}`
      );
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
    await send(target, deletedLog(message, config.t, deletedBy));
  }

  async logBulkDeletion(
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
    await send(target, bulkDeleteLog(messages, channel.id, config.t));
  }

  async logEdit(
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
      let reason = "not a member text change";
      if (!config.get("logEdits")) {
        reason = "edit logging disabled";
      } else if (before.partial || after.partial) {
        reason = "uncached message";
      }
      logger.debug(
        `Edit not logged | reason = ${reason} | messageId = ${after.id} | channelId = ${after.channelId}`
      );
      return;
    }
    const target = logTargetFor(before.channel, config);
    if (!target) {
      return;
    }
    await send(target, editedLog(before, after, config.t));
  }
}

export default declareService(new MessageLogService());
