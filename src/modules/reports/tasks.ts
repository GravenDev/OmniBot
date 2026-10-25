import type { Client } from "discord.js";
import configService from "#core/services/config.service.js";
import { createT } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import {
  MAX_RETENTION_SECONDS,
  type ReportsConfigSchema,
} from "./reports.config.js";
import { purgedMessage } from "./services/alert-view.js";
import reportService from "./services/report.service.js";
import store, { type ReportExpiry } from "./services/store.js";

const logger = loggerMaker("reports");

export function isExpired(
  report: Pick<ReportExpiry, "status" | "handledAt" | "lastReportedAt">,
  closedBefore: Date,
  reportedBefore: Date
): boolean {
  if (report.lastReportedAt < reportedBefore) {
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
  for (const { id } of await store.expired(
    guildId,
    closedBefore,
    reportedBefore
  )) {
    const done = await reportService.withExpiry(guildId, id, async (report) => {
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
            `Alert not purged, already gone | reportId = ${report.id}`
          );
        }
      }
      await store.delete(report.id);
      return true;
    });
    if (done) {
      purged++;
    }
  }
  return purged;
}

export async function encryptStoredReports(): Promise<void> {
  await store
    .encryptPlaintext()
    .then((count) => {
      if (count > 0) {
        logger.info(`Reports encrypted | count = ${count}`);
      }
    })
    .catch((err: unknown) => logger.error({ err }, "Report encryption failed"));
}

export function reportsTasks(module: Module<ReportsConfigSchema>) {
  return [
    declareTask({
      id: "purge",
      schedule: "0 4 * * *",
      async run(client) {
        for (const guildId of await store.guildIds()) {
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
        await encryptStoredReports();
      },
    }),
  ];
}
