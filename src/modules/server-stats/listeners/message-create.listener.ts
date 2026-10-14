import { declareEventListener } from "#lib/listener.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import { collectMessage } from "#modules/server-stats/services/collector.js";

export default declareEventListener<"messageCreate", ServerStatsConfigSchema>({
  eventType: "messageCreate",

  async execute(message, config) {
    if (config) {
      await collectMessage(message, config);
    }
  },
});
