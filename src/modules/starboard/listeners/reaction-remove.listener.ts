import { declareEventListener } from "#lib/listener.js";
import starboard, {
  isCounted,
} from "#modules/starboard/services/starboard.service.js";
import type { StarboardConfigSchema } from "#modules/starboard/starboard.config.js";

export const reactionRemoveListener = declareEventListener<
  "messageReactionRemove",
  StarboardConfigSchema
>({
  eventType: "messageReactionRemove",

  async execute(reaction, user, _details, config) {
    if (!config || user.bot || !isCounted(reaction.emoji, config)) {
      return;
    }
    await starboard.refreshIfStarred(reaction.message, config);
  },
});

export const reactionRemoveEmojiListener = declareEventListener<
  "messageReactionRemoveEmoji",
  StarboardConfigSchema
>({
  eventType: "messageReactionRemoveEmoji",

  async execute(reaction, config) {
    if (!config || !isCounted(reaction.emoji, config)) {
      return;
    }
    await starboard.refreshIfStarred(reaction.message, config);
  },
});

export const reactionRemoveAllListener = declareEventListener<
  "messageReactionRemoveAll",
  StarboardConfigSchema
>({
  eventType: "messageReactionRemoveAll",

  async execute(message, _reactions, config) {
    if (config) {
      await starboard.refreshIfStarred(message, config);
    }
  },
});
