import { AttachmentBuilder, type Client } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";
import {
  buildDailyLeaderboard,
  utcDayRange,
} from "#modules/rngdle/services/boards.js";
import syncService from "#modules/rngdle/services/sync.service.js";

const logger = loggerMaker("rngdle");

export async function postDailyLeaderboard(
  client: Client<true>,
  module: Module<RngdleConfigSchema>,
  guildId: string
): Promise<boolean> {
  const { default: configService } =
    await import("#core/services/config.service.js");
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("leaderboardChannel");
  if (!channel?.isSendable()) {
    return false;
  }

  const board = await buildDailyLeaderboard(
    client,
    guildId,
    utcDayRange(1),
    config.t
  );
  if (!board) {
    return false;
  }

  await channel.send({
    content: config.t("daily.message", {
      winners: board.winnerIds.map((id) => `<@${id}>`).join(" "),
    }),
    files: [new AttachmentBuilder(board.image, { name: "leaderboard.png" })],
    allowedMentions: { users: board.winnerIds },
  });
  return true;
}

export function createDailyLeaderboardTask(module: Module<RngdleConfigSchema>) {
  return declareTask({
    id: "daily-leaderboard",
    schedule: "0 1 * * *",
    async run(client) {
      await syncService.syncAll();

      const { default: moduleService } =
        await import("#core/services/module.service.js");
      for (const guildId of await moduleService.getActivatedGuildIds(
        module.id
      )) {
        try {
          if (await postDailyLeaderboard(client, module, guildId)) {
            logger.info(`Daily leaderboard posted | guildId = ${guildId}`);
          }
        } catch (err) {
          logger.error(
            { err },
            `Failed to post the daily leaderboard | guildId = ${guildId}`
          );
        }
      }
    },
  });
}
