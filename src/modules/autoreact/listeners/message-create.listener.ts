import { RESTJSONErrorCodes, type Message } from "discord.js";
import { apiErrorCode } from "#lib/discord-errors.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import store from "#modules/autoreact/services/store.js";

const logger = loggerMaker("autoreact");

const PAUSE_MS = 10 * 60_000;

const CUSTOM_EMOJI = /^<a?:\w+:\d+>$/;

const PAUSING_ERRORS = new Set<number>([
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
  RESTJSONErrorCodes.UnknownEmoji,
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
      logger.debug(
        `Reaction skipped | reason = paused after a permission error | guildId = ${guildId} | channelId = ${channelId}`
      );
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
      const code = apiErrorCode(err);
      if (code === RESTJSONErrorCodes.ReactionWasBlocked) {
        logger.debug(
          `Reaction blocked by the author | guildId = ${guildId} | channelId = ${channelId}`
        );
        return;
      }
      if (
        code === RESTJSONErrorCodes.UnknownEmoji &&
        CUSTOM_EMOJI.test(emoji)
      ) {
        await store.remove(guildId, channelId);
        logger.warn(
          `Unknown emoji, auto-reaction removed | guildId = ${guildId} | channelId = ${channelId} | emoji = ${emoji}`
        );
        return;
      }
      const paused = code !== undefined && PAUSING_ERRORS.has(code);
      if (paused) {
        pausedUntil.set(channelId, Date.now() + PAUSE_MS);
      }
      logger.warn(
        { err },
        `Reaction failed | guildId = ${guildId} | channelId = ${channelId} | messageId = ${message.id} | emoji = ${emoji} | code = ${code} | paused = ${paused}`
      );
    }
  },
});
