import type { Guild } from "discord.js";
import moduleService from "#core/services/module.service.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { syncRound } from "#modules/four-hour-game/services/round-sync.js";
import { closeDays } from "#modules/four-hour-game/tasks.js";

const logger = loggerMaker("four-hour-game");

/**
 * The game goes on while the bot is away from a guild: when the guild comes
 * back, the bot catches up as after a downtime, the absence replayed then the
 * days missed closed. A guild comes back with `guildCreate` when the bot is
 * invited back, and with `guildAvailable` after a Discord outage or a new
 * gateway session, the messages of the meantime never received. Neither
 * fires for the guilds received before the bot is ready: the startup sync
 * covers those. Replaying twice changes nothing, so a guild unavailable at
 * startup, synced then and again when it comes back, scores nothing twice.
 *
 * The core reads no guild id from a guild, so it runs these at once, before
 * any message of the guild: the replay takes the guild's queue first, and
 * only there waits to know whether the module is activated.
 */
export default function guildReturnListeners(
  module: Module<FourHourGameConfigSchema>
) {
  async function catchUp(guild: Guild): Promise<void> {
    const activated = moduleService
      .getModuleStateFromGuildIdIn(module.id, guild.id)
      .then((state) => state.activated);
    // Awaited within the queue, maybe later: its failure is handled there.
    activated.catch(() => undefined);
    await syncRound(module, guild.id, activated).catch((err: unknown) =>
      logger.warn({ err }, `Could not sync the round | guildId = ${guild.id}`)
    );
    // A failed lookup is already logged by the round sync above.
    if (await activated.catch(() => false)) {
      await closeDays(module, guild.id);
    }
  }

  return [
    declareEventListener({ eventType: "guildCreate", execute: catchUp }),
    declareEventListener({ eventType: "guildAvailable", execute: catchUp }),
  ];
}
