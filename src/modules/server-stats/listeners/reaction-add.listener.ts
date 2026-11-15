import { declareEventListener } from "#lib/listener.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import collector from "#modules/server-stats/services/collector.service.js";

export default declareEventListener<
  "messageReactionAdd",
  ServerStatsConfigSchema
>({
  eventType: "messageReactionAdd",

  async execute(reaction, user, _details, config) {
    if (config) {
      await collector.collectReaction(reaction, user, config);
    }
  },
});
