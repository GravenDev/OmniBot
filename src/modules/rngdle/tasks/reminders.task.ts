import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { RngdleConfigSchema } from "../rngdle.config.js";
import { REMINDER_HOUR_UTC } from "../services/reminders.service.js";
import sync from "../services/sync.service.js";
import { postReminders } from "./posting.js";

const logger = loggerMaker("rngdle");

export function remindersTask(module: Module<RngdleConfigSchema>) {
  return declareTask({
    id: "reminders",
    schedule: `0 ${REMINDER_HOUR_UTC} * * *`,
    async run() {
      await sync
        .syncAll()
        .catch((err: unknown) =>
          logger.warn({ err }, "Sync before the reminders failed")
        );
      const now = new Date();
      for (const guildId of await moduleService.getActivatedGuildIds(
        module.id
      )) {
        await postReminders(module, guildId, now).catch((err: unknown) =>
          logger.error(
            { err },
            `Failed to post the reminders | guildId = ${guildId}`
          )
        );
      }
    },
  });
}
