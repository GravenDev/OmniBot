import { declareEventListener } from "#lib/listener.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import { logDeletion } from "#modules/message-log/services/handlers.js";

export default declareEventListener<"messageDelete", MessageLogConfigSchema>({
  eventType: "messageDelete",

  async execute(message, config) {
    if (config) {
      await logDeletion(message, config);
    }
  },
});
