import { declareEventListener } from "#lib/listener.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import { logBulkDeletion } from "#modules/message-log/services/handlers.js";

export default declareEventListener<
  "messageDeleteBulk",
  MessageLogConfigSchema
>({
  eventType: "messageDeleteBulk",

  async execute(messages, channel, config) {
    if (config) {
      await logBulkDeletion(messages, channel, config);
    }
  },
});
