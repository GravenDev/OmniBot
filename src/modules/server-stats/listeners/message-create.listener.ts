import { declareEventListener } from "#lib/listener.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import collector from "#modules/server-stats/services/collector.service.js";

export default declareEventListener<"messageCreate", ServerStatsConfigSchema>({
  eventType: "messageCreate",

  async execute(message, config) {
    if (config) {
      await collector.collectMessage(message, config);
    }
  },
});
