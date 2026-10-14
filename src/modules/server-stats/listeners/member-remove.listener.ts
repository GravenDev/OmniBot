import { declareEventListener } from "#lib/listener.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import { collectMemberChange } from "#modules/server-stats/services/collector.js";

export default declareEventListener<
  "guildMemberRemove",
  ServerStatsConfigSchema
>({
  eventType: "guildMemberRemove",

  async execute(member, config) {
    if (config) {
      await collectMemberChange(member, "leaves");
    }
  },
});
