import { declareEventListener } from "#lib/listener.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import collector from "#modules/server-stats/services/collector.service.js";

export default declareEventListener<"guildMemberAdd", ServerStatsConfigSchema>({
  eventType: "guildMemberAdd",

  async execute(member, config) {
    if (config) {
      await collector.collectMemberChange(member, "joins");
    }
  },
});
