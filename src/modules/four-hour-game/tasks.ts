import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import { GAME_TIME_ZONE } from "./daily.js";
import type { FourHourGameConfigSchema } from "./four-hour-game.config.js";
import dailyService from "./services/daily.service.js";

export function fourHourGameTasks(module: Module<FourHourGameConfigSchema>) {
  return [
    declareTask({
      id: "daily-point",
      schedule: "0 0 * * *",
      timezone: GAME_TIME_ZONE,
      run: (client) => dailyService.closeAllDays(client, module),
    }),
  ];
}
