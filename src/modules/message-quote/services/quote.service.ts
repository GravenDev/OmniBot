import {
  ChannelType,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import {
  excludedIdsOf,
  isExcluded,
  isNsfw,
  READ_PERMISSIONS,
} from "#lib/channel-audience.js";
import type { ConfigProvider } from "#lib/config.js";
import { LogThrottle } from "#lib/log-throttle.js";
import { loggerMaker } from "#lib/logger.js";
import { missingBotPermissions } from "#lib/permissions.js";
import { repliedTo, sendWithMediaFallback } from "#lib/reported-message.js";
import { declareService, type Service } from "#lib/service.js";
import type { MessageQuoteConfigSchema } from "#modules/message-quote/message-quote.config.js";
import {
  isOwnQuote,
  type MessageLink,
  parseMessageLinks,
  type Quote,
  quoteReply,
} from "./quote.js";

const logger = loggerMaker("message-quote");

/** Quotes the messages whose link a member posts, when that member may read them. */
export class QuoteService implements Service {
  private readonly warnings = new LogThrottle();

  async canRead(
    member: GuildMember,
    channel: GuildBasedChannel
  ): Promise<boolean> {
    const permissions = channel.permissionsFor(member);
    if (!permissions?.has(READ_PERMISSIONS)) {
      return false;
    }
    if (
      channel.type !== ChannelType.PrivateThread ||
      permissions.has(PermissionFlagsBits.ManageThreads)
    ) {
      return true;
    }
    return (
      (await channel.members
        .fetch({ member: member.id, force: true, cache: false })
        .catch(() => null)) !== null
    );
  }

  async resolveQuote(
    source: Message<true>,
    member: GuildMember,
    link: MessageLink,
    excludedIds: ReadonlySet<string>
  ): Promise<Message<true> | null> {
    const channel = await source.guild.channels
      .fetch(link.channelId)
      .catch(() => null);
    const skip = (reason: string): null => {
      logger.debug(
        `Quote skipped | reason = ${reason} | guildId = ${source.guildId} | channelId = ${link.channelId} | messageId = ${link.messageId} | userId = ${member.id}`
      );
      return null;
    };
    if (!channel?.isTextBased()) {
      return skip("channel not found or not text");
    }
    if (isExcluded(channel, excludedIds)) {
      return skip("excluded channel");
    }
    if (isNsfw(channel) && !isNsfw(source.channel)) {
      return skip("nsfw channel quoted from a non-nsfw channel");
    }
    if (!(await this.canRead(member, channel))) {
      return skip("quoter cannot read the channel");
    }
    const quoted = await channel.messages
      .fetch(link.messageId)
      .catch(() => null);
    if (!quoted) {
      return skip("message not found");
    }
    return isOwnQuote(quoted) ? skip("message is already a quote") : quoted;
  }

  async quoteLinks(
    message: Message<true>,
    config: ConfigProvider<MessageQuoteConfigSchema>
  ): Promise<void> {
    const links = parseMessageLinks(message.content, message.guildId);
    if (links.length === 0) {
      return;
    }

    const excludedIds = excludedIdsOf(
      config.get("excludedChannels"),
      config.get("excludedCategories")
    );
    if (isExcluded(message.channel, excludedIds)) {
      logger.debug(
        `Quote ignored | reason = excluded channel | guildId = ${message.guildId} | channelId = ${message.channelId}`
      );
      return;
    }

    const missing = await missingBotPermissions(
      message.guild,
      message.channel,
      [
        "ViewChannel",
        message.channel.isThread() ? "SendMessagesInThreads" : "SendMessages",
        "ReadMessageHistory",
      ]
    );
    if (missing.length > 0) {
      // Once an hour per channel: every link posted there would log it again.
      logger[this.warnings.level(`permissions:${message.channelId}`)](
        `Quote skipped | reason = missing channel permissions | guildId = ${message.guildId} | channelId = ${message.channelId} | missing = ${missing.join(",")}`
      );
      return;
    }

    const member =
      message.member ??
      (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) {
      logger.debug(
        `Quote ignored | reason = author not resolvable | guildId = ${message.guildId} | userId = ${message.author.id}`
      );
      return;
    }

    const quotes = (
      await Promise.all(
        links.map(async (link): Promise<Quote | null> => {
          const quoted = await this.resolveQuote(
            message,
            member,
            link,
            excludedIds
          );
          return quoted && { message: quoted, reply: await repliedTo(quoted) };
        })
      )
    ).filter((quote) => quote !== null);
    if (quotes.length === 0) {
      logger.debug(
        `Quote ignored | reason = no quotable link | guildId = ${message.guildId} | channelId = ${message.channelId} | messageId = ${message.id} | links = ${links.length}`
      );
      return;
    }

    const send = (withMedia: boolean) => {
      const reply = quoteReply(quotes, member, config.t, withMedia);
      return message.reply({
        ...reply,
        failIfNotExists: false,
        // The message with the link already notified the channel: no second
        // push.
        flags: reply.flags | MessageFlags.SuppressNotifications,
      });
    };
    await sendWithMediaFallback(send, (err) =>
      logger.warn(
        { err },
        `Quote refused by Discord, retrying without media | guildId = ${message.guildId} | messageId = ${message.id}`
      )
    );
  }
}

export default declareService(new QuoteService());
