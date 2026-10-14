import { declareEventListener } from "#lib/listener.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import { collectReaction } from "#modules/server-stats/services/collector.js";

export default declareEventListener<
  "messageReactionAdd",
  ServerStatsConfigSchema
>({
  eventType: "messageReactionAdd",

  async execute(reaction, user, _details, config) {
    if (config) {
      await collectReaction(reaction, user, config);
    }
  },
});
