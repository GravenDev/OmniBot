import { AttachmentBuilder, type Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import type { RngdleConfigSchema } from "./rngdle.config.js";
import { fetchScoreTable } from "./services/api.js";
import store from "./services/store.js";
import sync from "./services/sync.js";
import { dailyLeaderboard } from "./services/views.js";

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

  await channel.send({
    content: config.t("daily.message", {
      winners: board.winnerIds.map((id) => `<@${id}>`).join(" "),
    }),
    files: [new AttachmentBuilder(board.image, { name: "leaderboard.png" })],
    allowedMentions: { users: board.winnerIds },
  });
  logger.info(`Daily leaderboard posted | guildId = ${guildId}`);
}

export function rngdleTasks(module: Module<RngdleConfigSchema>) {
  return [
    declareTask({
      id: "sync",
      schedule: "0 6,18 * * *",
      run: () => sync.syncAll().then(() => undefined),
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
