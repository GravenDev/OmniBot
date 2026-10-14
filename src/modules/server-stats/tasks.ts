import type { Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { ServerStatsConfigSchema } from "./server-stats.config.js";
import { addDays, dayOf, TIMEZONE } from "./services/day.js";
import { reportEmbed } from "./services/report.js";
import store from "./services/store.js";

export const RETENTION_DAYS = 90;

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
  const stats = await store.dailyStats(guildId, day);
  if (!stats) {
    return;
  }
  const guild = await client.guilds.fetch(guildId);
  await channel.send({
    embeds: [
      reportEmbed(stats, {
        day,
        memberCount: guild.memberCount,
        showTopMembers: config.get("showTopMembers"),
        t: config.t,
        locale: config.locale,
      }),
    ],
    allowedMentions: { parse: [] },
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
        await store.purgeBefore(addDays(day, -RETENTION_DAYS));
      },
    }),
  ];
}
