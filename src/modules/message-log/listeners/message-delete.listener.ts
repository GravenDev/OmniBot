import { declareEventListener } from "#lib/listener.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import messageLog from "#modules/message-log/services/message-log.service.js";

export default declareEventListener<"messageDelete", MessageLogConfigSchema>({
  eventType: "messageDelete",

  async execute(message, config) {
    if (config) {
      await messageLog.logDeletion(message, config);
    }
  },
});
