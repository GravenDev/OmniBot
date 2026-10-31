import {
  type Client,
  DiscordAPIError,
  type Message,
  MessageType,
  type PartialMessage,
  RESTJSONErrorCodes,
} from "discord.js";
import { type ConfigProvider, matchesEmoji } from "#lib/config.js";
import { isApiError } from "#lib/discord-errors.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import type { StarboardConfigSchema } from "#modules/starboard/starboard.config.js";
import {
  ineligibility,
  leakage,
  starboardChannelOf,
  thresholdOf,
} from "./eligibility.js";
import store, { type StarboardEntry } from "./store.js";
import { type Tally, tallyReactions, upperBound } from "./tally.js";
import { starboardMessage } from "./view.js";

const logger = loggerMaker("starboard");

type Config = ConfigProvider<StarboardConfigSchema>;
type AnyMessage = Message | PartialMessage;

const GONE = [
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.UnknownChannel,
];
const BULK_DELETE_LIMIT = 100;

const FORBIDDEN = [
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
];

export function isCounted(
  emoji: { id: string | null; name: string | null },
  config: Config
): boolean {
  return config
    .get("emojis")
    .some((configured) => matchesEmoji(configured, emoji));
}

type Mode = "edited" | "starred" | "any";

function sameTally(a: Tally, b: Tally | null): boolean {
  return !!b && JSON.stringify(a) === JSON.stringify(b);
}

const MODE_RANK: Record<Mode, number> = { edited: 0, starred: 1, any: 2 };

interface Pending {
  mode: Mode;
  edited: boolean;
  config: Config;
}

class StarboardService implements Service {
  private readonly queue = new KeyedQueue();
  private readonly pending = new Map<string, Pending>();

  refresh(message: AnyMessage, config: Config): Promise<void> {
    return this.schedule(message, config, "any");
  }

  refreshIfStarred(message: AnyMessage, config: Config): Promise<void> {
    return this.schedule(message, config, "starred");
  }

  refreshContent(message: AnyMessage, config: Config): Promise<void> {
    return this.schedule(message, config, "edited");
  }

  async handleDeletion(messageId: string, client: Client): Promise<void> {
    await this.queue.run(messageId, async () => {
      const [entry] = await store.findInvolving([messageId]);
      if (!entry) {
        return;
      }
      if (entry.messageId === messageId) {
        await this.discard(messageId, client);
      } else {
        await this.queue.run(entry.messageId, () =>
          store.dismiss(entry.messageId, messageId)
        );
      }
    });
  }

  async handleDeletions(messageIds: string[], client: Client): Promise<void> {
    const idle = messageIds.filter((id) => !this.queue.isBusy(id));
    for (const id of messageIds.filter((id) => this.queue.isBusy(id))) {
      await this.handleDeletion(id, client);
    }
    if (idle.length === 0) {
      return;
    }
    const deleted = new Set(idle);
    for (const entry of await store.findInvolving(idle)) {
      if (deleted.has(entry.messageId)) {
        await this.queue.run(entry.messageId, () =>
          this.discard(entry.messageId, client)
        );
      } else if (entry.starboardMessageId) {
        const starboardMessageId = entry.starboardMessageId;
        await this.queue.run(entry.messageId, () =>
          store.dismiss(entry.messageId, starboardMessageId)
        );
      }
    }
  }

  async handleChannelDeletion(
    guildId: string,
    channelId: string,
    client: Client
  ): Promise<void> {
    const reposts = new Map<string, string[]>();
    for (const entry of await store.listForChannel(guildId, channelId)) {
      if (entry.starboardMessageId) {
        const ids = reposts.get(entry.starboardChannelId) ?? [];
        ids.push(entry.starboardMessageId);
        reposts.set(entry.starboardChannelId, ids);
      }
    }
    for (const [starboardChannelId, ids] of reposts) {
      await this.deleteReposts(client, starboardChannelId, ids).catch(
        (err: unknown) =>
          logger.warn(
            { err },
            `Reposts of a deleted channel not removed | channelId = ${channelId}`
          )
      );
    }
    await store.removeForChannel(guildId, channelId);
  }

  private async deleteReposts(
    client: Client,
    starboardChannelId: string,
    ids: string[]
  ): Promise<void> {
    const channel = await this.starboardChannel(client, starboardChannelId);
    if (!channel) {
      return;
    }
    for (let start = 0; start < ids.length; start += BULK_DELETE_LIMIT) {
      const batch = ids.slice(start, start + BULK_DELETE_LIMIT);
      let remaining = batch;
      try {
        const deleted = await channel.bulkDelete(batch, true);
        remaining = batch.filter((id) => !deleted.has(id));
      } catch (err) {
        if (!(err instanceof DiscordAPIError)) {
          throw err;
        }
      }
      for (const id of remaining) {
        await channel.messages.delete(id).catch((err: unknown) => {
          if (!isApiError(err, ...GONE)) {
            throw err;
          }
        });
      }
    }
  }

  private async schedule(
    message: AnyMessage,
    config: Config,
    mode: Mode
  ): Promise<void> {
    const queued = this.pending.get(message.id);
    if (queued) {
      queued.config = config;
      if (MODE_RANK[mode] > MODE_RANK[queued.mode]) {
        queued.mode = mode;
      }
      queued.edited ||= mode === "edited";
      return;
    }
    const edited = mode === "edited";
    this.pending.set(message.id, { mode, edited, config });
    await this.queue.run(message.id, async () => {
      const latest = this.pending.get(message.id) ?? { mode, edited, config };
      this.pending.delete(message.id);
      try {
        await this.sync(message, latest.config, latest.mode, latest.edited);
      } catch (err) {
        if (isApiError(err, ...FORBIDDEN)) {
          logger.warn(
            { err },
            `Starboard is missing permissions | messageId = ${message.id}`
          );
          return;
        }
        logger.error(
          { err },
          `Starboard refresh failed | messageId = ${message.id}`
        );
      }
    });
  }

  private async sync(
    ref: AnyMessage,
    config: Config,
    mode: Mode,
    edited: boolean
  ): Promise<void> {
    const entry = await store.find(ref.id);
    if (entry && !entry.starboardMessageId) {
      return;
    }
    const emojis = config.get("emojis");
    const threshold = thresholdOf(config);
    const starboard = starboardChannelOf(config);
    if (
      !entry &&
      (mode !== "any" ||
        !starboard ||
        ref.channelId === starboard.id ||
        (!ref.partial && upperBound(ref, emojis) < threshold))
    ) {
      return;
    }

    let message: Message;
    try {
      message = await ref.fetch(true);
    } catch (err) {
      if (isApiError(err, ...GONE)) {
        await this.discard(ref.id, ref.client);
        return;
      }
      throw err;
    }
    if (!message.inGuild()) {
      return;
    }

    if (entry?.starboardMessageId) {
      await this.update(
        message,
        entry,
        entry.starboardMessageId,
        config,
        mode === "edited",
        edited
      );
      return;
    }
    if (!starboard) {
      return;
    }

    const blocked = ineligibility(message, starboard, config);
    if (blocked) {
      logger.debug(
        `Message not starrable | reason = ${blocked} | messageId = ${message.id}`
      );
      return;
    }
    if (upperBound(message, emojis) < threshold) {
      return;
    }
    const tally = await tallyReactions(message, emojis, config.get("selfStar"));
    if (tally.total < threshold) {
      return;
    }

    const sent = await this.post(message, tally, config, (payload) =>
      starboard.send(payload)
    );
    try {
      await store.create({
        messageId: message.id,
        guildId: message.guildId,
        channelId: message.channelId,
        parentChannelId: message.channel.isThread()
          ? message.channel.parentId
          : null,
        starboardChannelId: starboard.id,
        starboardMessageId: sent.id,
        tally,
      });
    } catch (err) {
      await sent.delete().catch(() => undefined);
      throw err;
    }
    logger.info(
      `Message starred | messageId = ${message.id} | count = ${tally.total}`
    );
  }

  private async update(
    message: Message<true>,
    entry: StarboardEntry,
    starboardMessageId: string,
    config: Config,
    contentOnly: boolean,
    edited: boolean
  ): Promise<void> {
    const channel = await this.starboardChannel(
      message.client,
      entry.starboardChannelId
    );
    if (!channel) {
      await store.remove(message.id);
      return;
    }
    const blocked = leakage(message.channel, channel);
    if (blocked) {
      logger.info(
        `Repost removed | reason = ${blocked} | messageId = ${message.id}`
      );
      await this.discard(message.id, message.client);
      return;
    }

    let tally = contentOnly ? entry.tally : null;
    if (!tally) {
      tally = await tallyReactions(
        message,
        config.get("emojis"),
        config.get("selfStar")
      );
      if (
        tally.total < thresholdOf(config) &&
        config.get("belowThreshold") === "remove"
      ) {
        await this.discard(message.id, message.client, true);
        return;
      }
      if (sameTally(tally, entry.tally) && !edited) {
        return;
      }
      await store.saveTally(message.id, tally);
    }

    try {
      await this.post(message, tally, config, (payload) =>
        channel.messages.edit(starboardMessageId, payload)
      );
    } catch (err) {
      if (isApiError(err, ...GONE)) {
        await store.dismiss(message.id, starboardMessageId);
        return;
      }
      throw err;
    }
  }

  private async discard(
    messageId: string,
    client: Client,
    dismissIfGone = false
  ): Promise<void> {
    const entry = await store.find(messageId);
    if (!entry) {
      return;
    }
    let gone = false;
    if (entry.starboardMessageId) {
      const channel = await this.starboardChannel(
        client,
        entry.starboardChannelId
      );
      await channel?.messages
        .delete(entry.starboardMessageId)
        .catch((err: unknown) => {
          if (isApiError(err, ...FORBIDDEN)) {
            logger.warn(
              { err },
              `Repost not deleted, missing permissions | messageId = ${messageId}`
            );
          } else if (isApiError(err, ...GONE)) {
            gone = true;
          } else {
            throw err;
          }
        });
    }
    if (gone && dismissIfGone && entry.starboardMessageId) {
      await store.dismiss(messageId, entry.starboardMessageId);
      return;
    }
    await store.remove(messageId);
  }

  private async starboardChannel(client: Client, channelId: string) {
    try {
      const channel = await client.channels.fetch(channelId);
      return channel?.isTextBased() && !channel.isDMBased() ? channel : null;
    } catch (err) {
      if (isApiError(err, ...GONE)) {
        return null;
      }
      throw err;
    }
  }

  private async post<T>(
    message: Message<true>,
    tally: Tally,
    config: Config,
    send: (payload: ReturnType<typeof starboardMessage>) => Promise<T>
  ): Promise<T> {
    const reply =
      message.type === MessageType.Reply
        ? await message.fetchReference().catch(() => null)
        : null;
    const render = (withMedia: boolean) =>
      starboardMessage(
        message,
        reply,
        tally,
        config.get("emojis")[0] ?? "⭐",
        config.t,
        withMedia
      );
    try {
      return await send(render(true));
    } catch (err) {
      if (!isApiError(err, RESTJSONErrorCodes.InvalidFormBodyOrContentType)) {
        throw err;
      }
      logger.warn(
        { err },
        `Repost refused by Discord, retrying without media | messageId = ${message.id}`
      );
      return send(render(false));
    }
  }
}

export default declareService(new StarboardService());
