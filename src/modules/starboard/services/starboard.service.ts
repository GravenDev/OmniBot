import {
  type Client,
  DiscordAPIError,
  type Message,
  MessageType,
  type PartialMessage,
  RESTJSONErrorCodes,
} from "discord.js";
import { type ConfigProvider, matchesEmoji } from "#lib/config.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import type { StarboardConfigSchema } from "#modules/starboard/starboard.config.js";
import {
  ineligibility,
  starboardChannelOf,
  thresholdOf,
} from "./eligibility.js";
import store, { type StarboardEntry } from "./store.js";
import { type Tally, tallyReactions, upperBound } from "./tally.js";
import { starboardMessage } from "./view.js";

const logger = loggerMaker("starboard");

type Config = ConfigProvider<StarboardConfigSchema>;
type AnyMessage = Message | PartialMessage;

function isApiError(err: unknown, ...codes: number[]): boolean {
  return err instanceof DiscordAPIError && codes.includes(err.code as number);
}

const GONE = [
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.UnknownChannel,
];
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

class StarboardService implements Service {
  private readonly queue = new KeyedQueue();
  private readonly pending = new Map<string, "any" | "starred">();

  refresh(message: AnyMessage, config: Config): Promise<void> {
    return this.schedule(message, config, "any");
  }

  refreshIfStarred(message: AnyMessage, config: Config): Promise<void> {
    return this.schedule(message, config, "starred");
  }

  async handleDeletion(messageId: string, client: Client): Promise<void> {
    await this.queue.run(messageId, async () => {
      const entry = await store.findInvolving(messageId);
      if (!entry) {
        return;
      }
      if (entry.messageId === messageId) {
        await this.discard(messageId, client);
      } else {
        await store.dismiss(entry.messageId, messageId);
      }
    });
  }

  async handleChannelDeletion(
    guildId: string,
    channelId: string,
    client: Client
  ): Promise<void> {
    for (const entry of await store.listForChannel(guildId, channelId)) {
      await this.queue
        .run(entry.messageId, () => this.discard(entry.messageId, client))
        .catch((err: unknown) =>
          logger.warn(
            { err },
            `Repost of a deleted channel not removed | messageId = ${entry.messageId}`
          )
        );
    }
    await store.removeForChannel(guildId, channelId);
  }

  private async schedule(
    message: AnyMessage,
    config: Config,
    mode: "any" | "starred"
  ): Promise<void> {
    if (this.pending.has(message.id)) {
      if (mode === "any") {
        this.pending.set(message.id, mode);
      }
      return;
    }
    this.pending.set(message.id, mode);
    await this.queue.run(message.id, async () => {
      const starredOnly = this.pending.get(message.id) === "starred";
      this.pending.delete(message.id);
      try {
        await this.sync(message, config, starredOnly);
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
    starredOnly: boolean
  ): Promise<void> {
    const entry = await store.find(ref.id);
    if ((!entry && starredOnly) || (entry && !entry.starboardMessageId)) {
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
      await this.update(message, entry, entry.starboardMessageId, config);
      return;
    }

    const starboard = starboardChannelOf(config);
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
    const emojis = config.get("emojis");
    const threshold = thresholdOf(config);
    if (upperBound(message, emojis) < threshold) {
      return;
    }
    const tally = await tallyReactions(message, emojis, config.get("selfStar"));
    if (tally.total < threshold) {
      return;
    }

    const sent = await starboard.send(
      await this.render(message, tally, config)
    );
    try {
      await store.create({
        messageId: message.id,
        guildId: message.guildId,
        channelId: message.channelId,
        starboardChannelId: starboard.id,
        starboardMessageId: sent.id,
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
    config: Config
  ): Promise<void> {
    const channel = await this.starboardChannel(message.client, entry);
    if (!channel) {
      await store.remove(message.id);
      return;
    }
    const blocked = ineligibility(message, channel, config);
    if (blocked === "audience" || blocked === "nsfw") {
      logger.info(
        `Repost removed | reason = ${blocked} | messageId = ${message.id}`
      );
      await this.discard(message.id, message.client);
      return;
    }

    const tally = await tallyReactions(
      message,
      config.get("emojis"),
      config.get("selfStar")
    );
    if (
      tally.total < thresholdOf(config) &&
      config.get("belowThreshold") === "remove"
    ) {
      await this.discard(message.id, message.client);
      return;
    }

    try {
      await channel.messages.edit(
        starboardMessageId,
        await this.render(message, tally, config)
      );
    } catch (err) {
      if (isApiError(err, ...GONE)) {
        await store.dismiss(message.id, starboardMessageId);
        return;
      }
      throw err;
    }
  }

  private async discard(messageId: string, client: Client): Promise<void> {
    const entry = await store.find(messageId);
    if (!entry) {
      return;
    }
    if (entry.starboardMessageId) {
      const channel = await this.starboardChannel(client, entry);
      await channel?.messages
        .delete(entry.starboardMessageId)
        .catch((err: unknown) => {
          if (isApiError(err, ...FORBIDDEN)) {
            logger.warn(
              { err },
              `Repost not deleted, missing permissions | messageId = ${messageId}`
            );
          } else if (!isApiError(err, ...GONE)) {
            throw err;
          }
        });
    }
    await store.remove(messageId);
  }

  private async starboardChannel(client: Client, entry: StarboardEntry) {
    try {
      const channel = await client.channels.fetch(entry.starboardChannelId);
      return channel?.isTextBased() && !channel.isDMBased() ? channel : null;
    } catch (err) {
      if (isApiError(err, ...GONE)) {
        return null;
      }
      throw err;
    }
  }

  private async render(message: Message<true>, tally: Tally, config: Config) {
    const reply =
      message.type === MessageType.Reply
        ? await message.fetchReference().catch(() => null)
        : null;
    return starboardMessage(
      message,
      reply,
      tally,
      config.get("emojis")[0] ?? "⭐",
      config.t
    );
  }
}

export default declareService(new StarboardService());
