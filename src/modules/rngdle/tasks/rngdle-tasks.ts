import type { Module } from "#lib/module.js";
import type { RngdleConfigSchema } from "../rngdle.config.js";
import { dailyLeaderboardTask } from "./daily-leaderboard.task.js";
import { remindersTask } from "./reminders.task.js";
import { scoreTableTask } from "./score-table.task.js";
import { syncTask } from "./sync.task.js";

export function rngdleTasks(module: Module<RngdleConfigSchema>) {
  return [
    syncTask(),
    remindersTask(module),
    scoreTableTask(),
    dailyLeaderboardTask(module),
  ];
}
