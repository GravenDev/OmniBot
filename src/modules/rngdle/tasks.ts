import { AttachmentBuilder, MessageFlags, type Client } from "discord.js";
import configService from "#core/services/config.service.js";
import mentionService from "#core/services/mention.service.js";
import moduleService from "#core/services/module.service.js";
import { forEachGuild } from "#lib/guild-loop.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import { startOfUtcDay } from "./days.js";
import { navigationRow } from "./interactions/navigation.button.js";
import { buildDailyMessage } from "./recap.js";
import { REMINDER_HOUR_UTC, reminderMessages } from "./reminders.js";
import type { RngdleConfigSchema } from "./rngdle.config.js";
import api from "./services/api.service.js";
import shareCards from "./services/share-cards.service.js";
import store from "./services/store.service.js";
import sync from "./services/sync.service.js";
import views from "./services/views.service.js";

const logger = loggerMaker("rngdle");

async function postDailyLeaderboard(
  client: Client<true>,
  module: Module<RngdleConfigSchema>,
  guildId: string
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("leaderboardChannel");
  if (!channel?.isSendable()) {
    logger[channel ? "warn" : "debug"](
      `Daily leaderboard skipped | reason = ${channel ? "leaderboard channel not sendable" : "no leaderboard channel"} | guildId = ${guildId}`
    );
    return;
  }

  const board = await views.dailyLeaderboard(
    { client, guildId, t: config.t, locale: config.locale },
    1
  );
  if (!board) {
    logger.info(
      `Daily leaderboard skipped | reason = no rolls yesterday | guildId = ${guildId}`
    );
    return;
  }
  const recap = await views.dailyRecap(guildId, 1).catch((err: unknown) => {
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
  logger.info(
    `Daily leaderboard posted | guildId = ${guildId} | channelId = ${channel.id} | winners = ${board.winnerIds.length}`
  );
}

async function postReminders(
  module: Module<RngdleConfigSchema>,
  guildId: string,
  now: Date
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("leaderboardChannel");
  if (!channel?.isSendable()) {
    logger[channel ? "warn" : "debug"](
      `Reminders skipped | reason = ${channel ? "leaderboard channel not sendable" : "no leaderboard channel"} | guildId = ${guildId}`
    );
    return;
  }

  const userIds = await store.pendingReminders(guildId, startOfUtcDay(now));
  if (userIds.length === 0) {
    logger.debug(
      `Reminders skipped | reason = nobody pending | guildId = ${guildId}`
    );
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
      run: (client) => sync.syncAll(client).then(() => undefined),
    }),
    declareTask({
      id: "reminders",
      schedule: `0 ${REMINDER_HOUR_UTC} * * *`,
      async run(client) {
        await sync
          .syncAll(client)
          .catch((err: unknown) =>
            logger.warn({ err }, "Sync before the reminders failed")
          );
        const now = new Date();
        await forEachGuild(
          client,
          await moduleService.getActivatedGuildIds(module.id),
          (guild) => postReminders(module, guild.id, now),
          { action: "post the reminders", logger }
        );
      },
    }),
    declareTask({
      id: "score-table",
      schedule: "0 3 * * 1",
      runOnStart: true,
      async run(client) {
        const table = await api.fetchScoreTable();
        if (!table) {
          logger.warn("No usable score table on rngdle.com, keeping ours");
        } else if (await store.replaceScoreTable(table)) {
          logger.info("Score table changed, downloading every roll again");
          await sync.syncAll(client, true);
        }
      },
    }),
    declareTask({
      id: "daily-leaderboard",
      schedule: "0 1 * * *",
      async run(client) {
        await sync
          .syncAll(client)
          .catch((err: unknown) =>
            logger.warn({ err }, "Sync before the daily leaderboard failed")
          );
        await forEachGuild(
          client,
          await moduleService.getActivatedGuildIds(module.id),
          (guild) => postDailyLeaderboard(client, module, guild.id),
          { action: "post the daily leaderboard", logger }
        );
      },
    }),
  ];
}

/**
 * Run even where the module is skipped (Discord did not grant its Message
 * Content intent) or its `onLoad` failed: the privacy policy deletes the card
 * marks two days later in every case.
 */
export function rngdleMaintenanceTasks() {
  return [
    declareTask({
      id: "cards",
      schedule: "0 2 * * *",
      // A night missed while the bot was down is caught up at start.
      runOnStart: true,
      run: () => shareCards.pruneCards(),
    }),
  ];
}
