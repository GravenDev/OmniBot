import { declareEventListener } from "#lib/listener.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import { logEdit } from "#modules/message-log/services/handlers.js";

export default declareEventListener<"messageUpdate", MessageLogConfigSchema>({
  eventType: "messageUpdate",

  async execute(before, after, config) {
    if (config) {
      await logEdit(before, after, config);
    }
  },
});
