import { AttachmentBuilder, MessageFlags, type Client } from "discord.js";
import configService from "#core/services/config.service.js";
import mentionService from "#core/services/mention.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import { navigationRow } from "./interactions/navigation.button.js";
import type { RngdleConfigSchema } from "./rngdle.config.js";
import { pruneCards } from "./services/announcements.js";
import { fetchScoreTable } from "./services/api.js";
import { startOfUtcDay } from "./services/days.js";
import { buildDailyMessage } from "./services/recap.js";
import { REMINDER_HOUR_UTC, reminderMessages } from "./services/reminders.js";
import store from "./services/store.js";
import sync from "./services/sync.js";
import { dailyLeaderboard, dailyRecap } from "./services/views.js";

const logger = loggerMaker("rngdle");

async function postDailyLeaderboard(
  client: Client<true>,
  module: Module<RngdleConfigSchema>,
  guildId: string
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("leaderboardChannel");
  if (!channel?.isSendable()) {
    return;
  }

  const board = await dailyLeaderboard(
    { client, guildId, t: config.t, locale: config.locale },
    1
  );
  if (!board) {
    return;
  }
  const recap = await dailyRecap(guildId, 1).catch((err: unknown) => {
    logger.warn(
      { err },
      `Failed to compute the daily recap | guildId = ${guildId}`
    );
    return null;
  });

  await channel.send({
    content: buildDailyMessage(board.winnerIds, recap, config.t, config.locale),
    files: [new AttachmentBuilder(board.image, { name: "leaderboard.png" })],
    components: [navigationRow(config.t, ["profile", "history", "overall"])],
    allowedMentions: {
      users: await mentionService.mentionable(guildId, board.winnerIds),
    },
    flags: MessageFlags.SuppressNotifications,
  });
  logger.info(`Daily leaderboard posted | guildId = ${guildId}`);
}

async function postReminders(
  module: Module<RngdleConfigSchema>,
  guildId: string,
  now: Date
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("leaderboardChannel");
  if (!channel?.isSendable()) {
    return;
  }

  const userIds = await store.pendingReminders(guildId, startOfUtcDay(now));
  if (userIds.length === 0) {
    return;
  }

  const mentionable = new Set(
    await mentionService.mentionable(guildId, userIds)
  );
  for (const message of reminderMessages(config.t, userIds, mentionable, now)) {
    await channel.send(message);
  }
  logger.info(
    `Reminders posted | guildId = ${guildId} | users = ${userIds.length}`
  );
}

export function rngdleTasks(module: Module<RngdleConfigSchema>) {
  return [
    declareTask({
      id: "sync",
      schedule: "0 6 * * *",
      run: () => sync.syncAll().then(() => undefined),
    }),
    declareTask({
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
    }),
    declareTask({
      id: "cards",
      schedule: "0 2 * * *",
      run: () => pruneCards(),
    }),
    declareTask({
      id: "score-table",
      schedule: "0 3 * * 1",
      runOnStart: true,
      async run() {
        const table = await fetchScoreTable();
        if (!table) {
          logger.warn("No usable score table on rngdle.com, keeping ours");
        } else if (await store.replaceScoreTable(table)) {
          logger.info("Score table changed, downloading every roll again");
          await sync.syncAll(true);
        }
      },
    }),
    declareTask({
      id: "daily-leaderboard",
      schedule: "0 1 * * *",
      async run(client) {
        await sync.syncAll();
        for (const guildId of await moduleService.getActivatedGuildIds(
          module.id
        )) {
          await postDailyLeaderboard(client, module, guildId).catch(
            (err: unknown) =>
              logger.error(
                { err },
                `Failed to post the daily leaderboard | guildId = ${guildId}`
              )
          );
        }
      },
    }),
  ];
}
