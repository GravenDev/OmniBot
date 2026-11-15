import { declareEventListener } from "#lib/listener.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import messageLog from "#modules/message-log/services/message-log.service.js";

export default declareEventListener<
  "messageDeleteBulk",
  MessageLogConfigSchema
>({
  eventType: "messageDeleteBulk",

  async execute(messages, channel, config) {
    if (config) {
      await messageLog.logBulkDeletion(messages, channel, config);
    }
  },
});
