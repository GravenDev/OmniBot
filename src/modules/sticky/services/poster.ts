import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type GuildTextBasedChannel,
} from "discord.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { declareService, type Service } from "#lib/service.js";
import store from "./store.js";

const logger = loggerMaker("sticky");

const PAUSE_MS = 10 * 60_000;

const PAUSING_ERRORS = new Set<number | string>([
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
]);

export type StickyChannel = Pick<
  GuildTextBasedChannel,
  "id" | "guildId" | "send" | "messages"
>;

class StickyPoster implements Service {
  private readonly queue = new KeyedQueue();
  private readonly pending = new Set<string>();
  private readonly pausedUntil = new Map<string, number>();

  bump(channel: StickyChannel): void {
    const channelId = channel.id;
    if (this.pending.has(channelId)) {
      return;
    }
    if ((this.pausedUntil.get(channelId) ?? 0) > Date.now()) {
      return;
    }
    this.pausedUntil.delete(channelId);

    this.pending.add(channelId);
    this.queue
      .run(channelId, () => {
        this.pending.delete(channelId);
        return this.attempt(channel);
      })
      .catch(() => undefined);
  }

  post(channel: StickyChannel): Promise<void> {
    this.pausedUntil.delete(channel.id);
    return this.queue.run(channel.id, () => this.attempt(channel));
  }

  unstick(channel: StickyChannel): Promise<boolean> {
    return this.queue.run(channel.id, async () => {
      const sticky = await store.get(channel.guildId, channel.id);
      const removed = await store.remove(channel.guildId, channel.id);
      if (sticky?.messageId) {
        await this.deleteQuietly(channel, sticky.messageId);
      }
      return removed > 0;
    });
  }

  reset(): void {
    this.pending.clear();
    this.pausedUntil.clear();
  }

  private async attempt(channel: StickyChannel): Promise<void> {
    try {
      await this.repost(channel);
    } catch (err) {
      const code = err instanceof DiscordAPIError ? err.code : undefined;
      if (code !== undefined && PAUSING_ERRORS.has(code)) {
        this.pausedUntil.set(channel.id, Date.now() + PAUSE_MS);
      }
      logger.warn(
        { err },
        `Sticky repost failed | guildId = ${channel.guildId} | channelId = ${channel.id}`
      );
      throw err;
    }
  }

  private async repost(channel: StickyChannel): Promise<void> {
    const sticky = await store.get(channel.guildId, channel.id);
    if (!sticky) {
      return;
    }
    const sent = await channel.send({
      content: sticky.content,
      allowedMentions: NO_MENTIONS,
    });
    try {
      await store.setMessageId(channel.guildId, channel.id, sent.id);
    } catch (err) {
      await this.deleteQuietly(channel, sent.id);
      throw err;
    }
    if (sticky.messageId) {
      await this.deleteQuietly(channel, sticky.messageId);
    }
  }

  private async deleteQuietly(
    channel: StickyChannel,
    messageId: string
  ): Promise<void> {
    try {
      await channel.messages.delete(messageId);
    } catch (err) {
      if (
        err instanceof DiscordAPIError &&
        err.code === RESTJSONErrorCodes.UnknownMessage
      ) {
        return;
      }
      logger.warn(
        { err },
        `Previous sticky not deleted | guildId = ${channel.guildId} | channelId = ${channel.id} | messageId = ${messageId}`
      );
    }
  }
}

export default declareService(new StickyPoster());
