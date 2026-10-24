import { DiscordAPIError, RESTJSONErrorCodes, type Message } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import store from "#modules/autoreact/services/store.js";

const logger = loggerMaker("autoreact");

const PAUSE_MS = 10 * 60_000;

const PAUSING_ERRORS = new Set<number | string>([
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
]);

const pausedUntil = new Map<string, number>();

export function resetPauses(): void {
  pausedUntil.clear();
}

export default declareEventListener<"messageCreate">({
  eventType: "messageCreate",

  async execute(message: Message, config) {
    if (
      !config ||
      !message.inGuild() ||
      message.system ||
      message.author.id === message.client.user.id
    ) {
      return;
    }

    const { guildId, channelId } = message;
    if ((pausedUntil.get(channelId) ?? 0) > Date.now()) {
      return;
    }
    pausedUntil.delete(channelId);

    const emoji = await store.emojiFor(guildId, channelId);
    if (!emoji) {
      return;
    }

    try {
      await message.react(emoji);
    } catch (err) {
      const code = err instanceof DiscordAPIError ? err.code : undefined;
      if (code === RESTJSONErrorCodes.UnknownEmoji) {
        await store.remove(guildId, channelId);
        logger.warn(
          `Unknown emoji, auto-reaction removed | guildId = ${guildId} | channelId = ${channelId} | emoji = ${emoji}`
        );
        return;
      }
      if (code !== undefined && PAUSING_ERRORS.has(code)) {
        pausedUntil.set(channelId, Date.now() + PAUSE_MS);
      }
      logger.warn(
        { err },
        `Reaction failed | guildId = ${guildId} | channelId = ${channelId} | emoji = ${emoji}`
      );
    }
  },
});
