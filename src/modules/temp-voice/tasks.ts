import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import { reconcile, seatWaitingMembers } from "./services/lifecycle.js";
import store from "./services/store.js";
import type { TempVoiceConfigSchema } from "./temp-voice.config.js";

export const PREFERENCE_RETENTION_DAYS = 365;

const logger = loggerMaker("temp-voice");

export function tempVoiceTasks(module: Module<TempVoiceConfigSchema>) {
  return [
    declareTask({
      id: "reconcile",
      schedule: "*/10 * * * *",
      runOnStart: true,
      async run(client) {
        const activated = new Set(
          await moduleService.getActivatedGuildIds(module.id)
        );
        const guildIds = new Set([...activated, ...(await store.guildIds())]);
        for (const guildId of guildIds) {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) {
            await store.removeGuildChannels(guildId);
            continue;
          }
          if (!guild.available) {
            continue;
          }
          try {
            await reconcile(guild);
            if (activated.has(guildId)) {
              await seatWaitingMembers(
                guild,
                await configService.getConfigForModuleIn(module, guildId)
              );
            }
          } catch (err) {
            logger.error(
              { err },
              `Reconciliation failed | guildId = ${guildId}`
            );
          }
        }
      },
    }),
  ];
}

export function tempVoiceMaintenanceTasks() {
  return [
    declareTask({
      id: "purge-preferences",
      schedule: "30 3 * * *",
      async run() {
        const cutoff = new Date(
          Date.now() - PREFERENCE_RETENTION_DAYS * 24 * 60 * 60_000
        );
        const count = await store.purgePreferencesBefore(cutoff);
        if (count > 0) {
          logger.info(`Preferences purged | count = ${count}`);
        }
      },
    }),
  ];
}
