import {
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type GuildTextBasedChannel,
} from "discord.js";
import { isApiError } from "#lib/discord-errors.js";
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

export interface Unstuck {
  removed: boolean;
  leftover: boolean;
}

export class StickyPoster implements Service {
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

  set(channel: StickyChannel, content: string): Promise<boolean> {
    return this.queue.run(channel.id, async () => {
      await store.set(channel.guildId, channel.id, content);
      this.pausedUntil.delete(channel.id);
      try {
        return await this.attempt(channel);
      } catch {
        return false;
      }
    });
  }

  unstick(channel: StickyChannel): Promise<Unstuck> {
    return this.queue.run(channel.id, async () => {
      const sticky = await store.get(channel.guildId, channel.id);
      const removed = (await store.remove(channel.guildId, channel.id)) > 0;
      const leftover = sticky?.messageId
        ? !(await this.deleteQuietly(channel, sticky.messageId))
        : false;
      return { removed, leftover };
    });
  }

  private async attempt(channel: StickyChannel): Promise<boolean> {
    try {
      return await this.repost(channel);
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

  private async repost(channel: StickyChannel): Promise<boolean> {
    const sticky = await store.get(channel.guildId, channel.id);
    if (!sticky) {
      return false;
    }
    const sent = await channel.send({
      content: sticky.content,
      allowedMentions: NO_MENTIONS,
      // Reposted after every message, it never says anything new: @silent, so
      // members following the channel get no push for each repost.
      flags: MessageFlags.SuppressNotifications,
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
    return true;
  }

  private async deleteQuietly(
    channel: StickyChannel,
    messageId: string
  ): Promise<boolean> {
    try {
      await channel.messages.delete(messageId);
      return true;
    } catch (err) {
      if (isApiError(err, RESTJSONErrorCodes.UnknownMessage)) {
        return true;
      }
      logger.warn(
        { err },
        `Sticky not deleted | guildId = ${channel.guildId} | channelId = ${channel.id} | messageId = ${messageId}`
      );
      return false;
    }
  }
}

export default declareService(new StickyPoster());
