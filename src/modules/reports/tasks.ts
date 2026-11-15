import type { Client } from "discord.js";
import configService from "#core/services/config.service.js";
import { eachLimited } from "#lib/concurrency.js";
import { GUILD_CONCURRENCY } from "#lib/guild-loop.js";
import { createT } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import { purgedMessage } from "./alert-view.js";
import {
  MAX_RETENTION_SECONDS,
  type ReportsConfigSchema,
} from "./reports.config.js";
import reportService from "./services/report.service.js";
import store, { type Report } from "./services/store.service.js";

const logger = loggerMaker("reports");

export function isExpired(
  report: Pick<Report, "status" | "handledAt" | "createdAt" | "reporters">,
  closedBefore: Date,
  reportedBefore: Date
): boolean {
  const lastReportedAt = report.reporters.reduce(
    (latest, { reportedAt }) => (reportedAt > latest ? reportedAt : latest),
    report.createdAt
  );
  if (lastReportedAt < reportedBefore) {
    return true;
  }
  return (
    report.status !== "open" &&
    report.handledAt !== null &&
    report.handledAt < closedBefore
  );
}

async function purgeGuild(
  client: Client<true>,
  module: Module<ReportsConfigSchema>,
  guildId: string
): Promise<number> {
  const [stored, locale] = await Promise.all([
    configService.getFullConfigForGuild(guildId),
    configService.getLocaleForGuild(guildId),
  ]);
  const retention = stored[module.id]?.["retention"];
  const t = createT(locale, module.id);
  const now = Date.now();
  const closedBefore = new Date(
    now -
      (typeof retention === "number"
        ? Math.min(retention, MAX_RETENTION_SECONDS)
        : MAX_RETENTION_SECONDS) *
        1000
  );
  const reportedBefore = new Date(now - MAX_RETENTION_SECONDS * 1000);

  let purged = 0;
  // In sequence: alerts usually share one channel, and its rate limit.
  for (const { id } of await store.expired(
    guildId,
    closedBefore,
    reportedBefore
  )) {
    const done = await reportService
      .withReport(guildId, id, async (report) => {
        if (!isExpired(report, closedBefore, reportedBefore)) {
          return false;
        }
        if (report.alertChannelId && report.alertMessageId) {
          try {
            const channel = await client.channels.fetch(report.alertChannelId);
            if (channel?.isTextBased()) {
              await channel.messages.edit(
                report.alertMessageId,
                purgedMessage(report.id, t)
              );
            }
          } catch (err) {
            logger.debug(
              { err },
              `Alert not purged | guildId = ${guildId} | reportId = ${report.id} | channelId = ${report.alertChannelId}`
            );
          }
        }
        await store.delete(report.id);
        return true;
      })
      .catch((err: unknown) => {
        // The guild's other reports are still purged; this one tomorrow.
        logger.error(
          { err },
          `Report not purged | guildId = ${guildId} | reportId = ${id}`
        );
        return false;
      });
    if (done) {
      purged++;
    }
  }
  return purged;
}

export function reportsTasks(module: Module<ReportsConfigSchema>) {
  return [
    declareTask({
      id: "purge",
      schedule: "0 4 * * *",
      async run(client) {
        // A few guilds at once: each has its own reports, alerts and rate
        // limits, and all of them together would drain the database's pool.
        // Not only the guilds the bot is on: a left guild's reports expire too.
        await eachLimited(
          await store.guildIds(),
          GUILD_CONCURRENCY,
          async (guildId) => {
            try {
              const count = await purgeGuild(client, module, guildId);
              if (count > 0) {
                logger.info(
                  `Reports purged | guildId = ${guildId} | count = ${count}`
                );
              }
            } catch (err) {
              logger.error(
                { err },
                `Report purge failed | guildId = ${guildId}`
              );
            }
          }
        );
      },
    }),
  ];
}
