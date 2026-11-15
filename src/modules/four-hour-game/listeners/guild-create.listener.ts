import moduleService from "#core/services/module.service.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { syncRound } from "#modules/four-hour-game/services/round-sync.js";
import { closeDays } from "#modules/four-hour-game/tasks.js";

const logger = loggerMaker("four-hour-game");

/**
 * The game goes on while the bot is away from a guild: invited back, it
 * catches up as after a downtime, the absence replayed then the days missed
 * closed. The core reads no guild id from `guildCreate`, so it runs this at
 * once, before any message of the guild: the replay takes the guild's queue
 * first, and only there waits to know whether the module is activated.
 */
export default function guildCreateListener(
  module: Module<FourHourGameConfigSchema>
) {
  return declareEventListener({
    eventType: "guildCreate",
    async execute(guild) {
      const activated = moduleService
        .getModuleStateFromGuildIdIn(module.id, guild.id)
        .then((state) => state.activated);
      // Awaited within the queue, maybe later: its failure is handled there.
      activated.catch(() => undefined);
      await syncRound(module, guild.id, activated).catch((err: unknown) =>
        logger.warn({ err }, `Could not sync the round | guildId = ${guild.id}`)
      );
      if (await activated) {
        await closeDays(module, guild.id);
      }
    },
  });
}
