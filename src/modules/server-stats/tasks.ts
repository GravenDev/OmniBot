import { AttachmentBuilder, type Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { ServerStatsConfigSchema } from "./server-stats.config.js";
import { addDays, dayOf, TIMEZONE } from "./services/day.js";
import { compare, previousDays } from "./services/insights.js";
import { renderReport } from "./services/report.js";
import store, { type Totals } from "./services/store.js";

export const RETENTION_DAYS = 30;

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
  const days = previousDays(day, stats.startedAt, RETENTION_DAYS);
  const history =
    days.length > 0
      ? await store.history(guildId, days.at(-1)!, days[0]!)
      : new Map<number, Totals>();
  const previous = days.flatMap((previousDay) => {
    const totals = history.get(previousDay.getTime());
    return totals ? [totals] : [];
  });
  const guild = await client.guilds.fetch(guildId);
  const report = await renderReport(guild, stats, {
    day,
    insights: compare(stats, previous),
    comparedDays: previous.length,
    showTopMembers: config.get("showTopMembers"),
    t: config.t,
    locale: config.locale,
  });
  await channel.send({
    content: report.content,
    files: [new AttachmentBuilder(report.image, { name: "server-stats.png" })],
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
