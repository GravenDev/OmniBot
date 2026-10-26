import { declareEventListener } from "#lib/listener.js";
import starboard from "#modules/starboard/services/starboard.service.js";
import type { StarboardConfigSchema } from "#modules/starboard/starboard.config.js";

export const messageUpdateListener = declareEventListener<
  "messageUpdate",
  StarboardConfigSchema
>({
  eventType: "messageUpdate",

  async execute(_before, after, config) {
    if (config) {
      await starboard.refreshContent(after, config);
    }
  },
});

export const messageDeleteListener = declareEventListener<
  "messageDelete",
  StarboardConfigSchema
>({
  eventType: "messageDelete",

  async execute(message, config) {
    if (config) {
      await starboard.handleDeletion(message.id, message.client);
    }
  },
});

export const messageDeleteBulkListener = declareEventListener<
  "messageDeleteBulk",
  StarboardConfigSchema
>({
  eventType: "messageDeleteBulk",

  async execute(messages, channel, config) {
    if (!config) {
      return;
    }
    await starboard.handleDeletions([...messages.keys()], channel.client);
  },
});
