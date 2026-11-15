import moduleService from "#core/services/module.service.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { BirthdayConfigSchema } from "./birthday.config.js";
import { runAllGuildDays } from "./services/daily.js";
import { sweepDepartures } from "./services/departures.js";

export function birthdayTasks(module: Module<BirthdayConfigSchema>) {
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

/**
 * Run even where the module is skipped (a missing privileged intent) or its
 * `onLoad` failed: the privacy policy deletes a departed member's birthday,
 * which the member-leave event alone cannot do then.
 */
export function birthdayMaintenanceTasks(moduleId: string) {
  return [
    declareTask({
      id: "sweep-departures",
      // At seniority's time: when both reach a guild within a minute, they
      // share one fetch of its member list.
      schedule: "30 4 * * *",
      // A night missed while the bot was down is caught up at start.
      runOnStart: true,
      async run(client) {
        await sweepDepartures(client, async (guildId) =>
          (await moduleService.getActivatedGuildIds(moduleId)).includes(guildId)
        );
      },
    }),
  ];
}
