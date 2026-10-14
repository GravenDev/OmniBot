import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { RngdleConfigSchema } from "../rngdle.config.js";
import sync from "../services/sync.service.js";
import { postDailyLeaderboard } from "./posting.js";

const logger = loggerMaker("rngdle");

export function dailyLeaderboardTask(module: Module<RngdleConfigSchema>) {
  return declareTask({
    id: "daily-leaderboard",
    schedule: "0 1 * * *",
    async run(client) {
      await sync.syncAll();
      for (const guildId of await moduleService.getActivatedGuildIds(
        module.id
      )) {
        await postDailyLeaderboard(client, module, guildId).catch(
          (err: unknown) =>
            logger.error(
              { err },
              `Failed to post the daily leaderboard | guildId = ${guildId}`
            )
        );
      }
    },
  });
}
