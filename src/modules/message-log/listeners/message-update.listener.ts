import { declareEventListener } from "#lib/listener.js";
import type { MessageLogConfigSchema } from "#modules/message-log/message-log.config.js";
import messageLog from "#modules/message-log/services/message-log.service.js";

export default declareEventListener<"messageUpdate", MessageLogConfigSchema>({
  eventType: "messageUpdate",

  async execute(before, after, config) {
    if (config) {
      await messageLog.logEdit(before, after, config);
    }
  },
});
