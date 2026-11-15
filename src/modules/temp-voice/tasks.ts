import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { forEachGuild } from "#lib/guild-loop.js";
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
        const withRows = await store.guildIds();
        // The rows of the guilds the bot left are forgotten in one query.
        const left = withRows.filter((id) => !client.guilds.cache.has(id));
        const guildIds = new Set([
          ...activated,
          ...withRows.filter((id) => !left.includes(id)),
        ]);
        if (left.length > 0) {
          await store
            .removeGuildChannels(left)
            .catch((err: unknown) =>
              logger.error(
                { err },
                `Left guilds' channels not forgotten | count = ${left.length}`
              )
            );
        }
        // A few guilds at once: each has its own channels, queues and rate
        // limits, and all of them together would drain the database's pool.
        await forEachGuild(
          client,
          guildIds,
          async (guild) => {
            if (!guild.available) {
              return;
            }
            const config = activated.has(guild.id)
              ? await configService.getConfigForModuleIn(module, guild.id)
              : null;
            await reconcile(guild, config?.t);
            if (config) {
              await seatWaitingMembers(guild, config);
            }
          },
          { action: "reconcile temporary voice channels", logger }
        );
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
