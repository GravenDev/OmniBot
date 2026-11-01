import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { SeniorityConfigSchema } from "./seniority.config.js";
import { runAllGuildDays } from "./services/daily.js";

export function seniorityTasks(module: Module<SeniorityConfigSchema>) {
  return [
    // Hourly: each guild posts at its own hour, in its own time zone. Running
    // at start catches up today's announcements after a restart.
    declareTask({
      id: "daily-announcements",
      schedule: "0 * * * *",
      runOnStart: true,
      run: (client) => runAllGuildDays(client, module),
    }),
  ];
}
