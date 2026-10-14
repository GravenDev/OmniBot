import { AttachmentBuilder, type Client } from "discord.js";
import configService from "#core/services/config.service.js";
import mentionService from "#core/services/mention.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { navigationRow } from "../interactions/navigation.button.js";
import type { RngdleConfigSchema } from "../rngdle.config.js";
import recapService from "../services/recap.service.js";
import reminders from "../services/reminders.service.js";
import store from "../services/store.service.js";
import views from "../services/views.service.js";

const logger = loggerMaker("rngdle");

export async function postDailyLeaderboard(
  client: Client<true>,
  module: Module<RngdleConfigSchema>,
  guildId: string
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("leaderboardChannel");
  if (!channel?.isSendable()) {
    return;
  }

  const board = await views.dailyLeaderboard(
    { client, guildId, t: config.t, locale: config.locale },
    1
  );
  if (!board) {
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
    content: recapService.buildDailyMessage(
      board.winnerIds,
      recap,
      config.t,
      config.locale
    ),
    files: [new AttachmentBuilder(board.image, { name: "leaderboard.png" })],
    components: [navigationRow(config.t, ["profile", "overall"])],
    allowedMentions: {
      users: await mentionService.mentionable(guildId, board.winnerIds),
    },
  });
  logger.info(`Daily leaderboard posted | guildId = ${guildId}`);
}

export async function postReminders(
  module: Module<RngdleConfigSchema>,
  guildId: string,
  now: Date
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("leaderboardChannel");
  if (!channel?.isSendable()) {
    return;
  }

  const userIds = await store.pendingReminders(
    guildId,
    reminders.startOfUtcDay(now)
  );
  if (userIds.length === 0) {
    return;
  }

  const mentionable = new Set(
    await mentionService.mentionable(guildId, userIds)
  );
  for (const message of reminders.reminderMessages(
    config.t,
    userIds,
    mentionable,
    now
  )) {
    await channel.send(message);
  }
  logger.info(
    `Reminders posted | guildId = ${guildId} | users = ${userIds.length}`
  );
}
