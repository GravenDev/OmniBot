import type { Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { ReportsConfigSchema } from "./reports.config.js";
import { purgedMessage } from "./services/alert-view.js";
import store from "./services/store.js";

const logger = loggerMaker("reports");

async function purgeGuild(
  client: Client<true>,
  module: Module<ReportsConfigSchema>,
  guildId: string
): Promise<number> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const before = new Date(Date.now() - config.get("retention") * 1000);

  const expired = await store.closedBefore(guildId, before);
  for (const report of expired) {
    if (report.alertChannelId && report.alertMessageId) {
      try {
        const channel = await client.channels.fetch(report.alertChannelId);
        if (channel?.isTextBased()) {
          await channel.messages.edit(
            report.alertMessageId,
            purgedMessage(report.id, config.t)
          );
        }
      } catch (err) {
        logger.debug(
          { err },
          `Alert not purged, already gone | reportId = ${report.id}`
        );
      }
    }
    await store.delete(report.id);
  }
  return expired.length;
}

export function reportsTasks(module: Module<ReportsConfigSchema>) {
  return [
    declareTask({
      id: "purge",
      schedule: "0 4 * * *",
      async run(client) {
        for (const guildId of await moduleService.getActivatedGuildIds(
          module.id
        )) {
          await purgeGuild(client, module, guildId)
            .then((count) => {
              if (count > 0) {
                logger.info(
                  `Reports purged | guildId = ${guildId} | count = ${count}`
                );
              }
            })
            .catch((err: unknown) =>
              logger.error(
                { err },
                `Report purge failed | guildId = ${guildId}`
              )
            );
        }
      },
    }),
  ];
}
