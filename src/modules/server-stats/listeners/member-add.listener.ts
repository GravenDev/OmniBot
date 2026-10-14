import { declareEventListener } from "#lib/listener.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";
import { collectMemberChange } from "#modules/server-stats/services/collector.js";

export default declareEventListener<"guildMemberAdd", ServerStatsConfigSchema>({
  eventType: "guildMemberAdd",

  async execute(member, config) {
    if (config) {
      await collectMemberChange(member, "joins");
    }
  },
});
