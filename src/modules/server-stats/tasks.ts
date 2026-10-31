import { AttachmentBuilder, type Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { ServerStatsConfigSchema } from "./server-stats.config.js";
import { addDays, dayOf, RETENTION_DAYS, TIMEZONE } from "./services/day.js";
import store from "./services/store.js";
import { channelShown } from "./services/tracking.js";
import { statsReport } from "./services/views.js";

const logger = loggerMaker("server-stats");

export async function postReport(
  client: Client<true>,
  module: Module<ServerStatsConfigSchema>,
  guildId: string,
  day: Date
): Promise<void> {
  if (!client.guilds.cache.has(guildId)) {
    return;
  }
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("reportChannel");
  if (!channel?.isSendable()) {
    return;
  }
  const guild = await client.guilds.fetch(guildId);
  const report = await statsReport(
    guild,
    { from: day, to: day },
    {
      now: new Date(),
      channelShown: channelShown(guild, config),
      showTopMembers: config.get("showTopMembers"),
      t: config.t,
      locale: config.locale,
    }
  );
  if (!report) {
    return;
  }
  await channel.send({
    content: report.content,
    files: [new AttachmentBuilder(report.image, { name: "server-stats.png" })],
    allowedMentions: NO_MENTIONS,
  });
  logger.info(`Daily report posted | guildId = ${guildId}`);
}

export function serverStatsTasks(module: Module<ServerStatsConfigSchema>) {
  return [
    declareTask({
      id: "daily-report",
      schedule: "0 0 * * *",
      timezone: TIMEZONE,
      async run(client) {
        const day = addDays(dayOf(new Date()), -1);
        for (const guildId of await moduleService.getActivatedGuildIds(
          module.id
        )) {
          await postReport(client, module, guildId, day).catch((err: unknown) =>
            logger.error(
              { err },
              `Failed to post the daily report | guildId = ${guildId}`
            )
          );
        }
      },
    }),
  ];
}

export function serverStatsMaintenanceTasks() {
  return [
    declareTask({
      id: "purge",
      schedule: "0 0 * * *",
      timezone: TIMEZONE,
      async run() {
        const day = addDays(dayOf(new Date()), -1);
        await store.purgeBefore(addDays(day, -RETENTION_DAYS));
      },
    }),
  ];
}
