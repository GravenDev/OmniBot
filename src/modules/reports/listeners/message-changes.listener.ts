import { declareEventListener } from "#lib/listener.js";
import type { ReportsConfigSchema } from "../reports.config.js";
import reportService from "../services/report.service.js";

export const messageUpdateListener = declareEventListener<
  "messageUpdate",
  ReportsConfigSchema
>({
  eventType: "messageUpdate",

  async execute(_old, message, config) {
    if (!config || !message.guildId) {
      return;
    }
    await reportService.messageChanged(
      message.client,
      config,
      message.guildId,
      message.id,
      {
        deleted: false,
        content: async () =>
          (message.partial ? await message.fetch() : message).content,
      }
    );
  },
});

export const messageDeleteListener = declareEventListener<
  "messageDelete",
  ReportsConfigSchema
>({
  eventType: "messageDelete",

  async execute(message, config) {
    if (!config || !message.guildId) {
      return;
    }
    await reportService.messageChanged(
      message.client,
      config,
      message.guildId,
      message.id,
      { deleted: true }
    );
  },
});

export const messageDeleteBulkListener = declareEventListener<
  "messageDeleteBulk",
  ReportsConfigSchema
>({
  eventType: "messageDeleteBulk",

  async execute(messages, channel, config) {
    if (!config) {
      return;
    }
    for (const message of messages.values()) {
      await reportService.messageChanged(
        channel.client,
        config,
        channel.guildId,
        message.id,
        { deleted: true }
      );
    }
  },
});
