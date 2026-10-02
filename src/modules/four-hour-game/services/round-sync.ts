import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { fetchLatestPlayerMessage } from "./channel-history.js";
import fourHourGameService from "./four-hour-game.service.js";

const logger = loggerMaker("four-hour-game");

export async function syncRound(
  module: Module<FourHourGameConfigSchema>,
  guildId: string
): Promise<void> {
  const { default: configService } =
    await import("#core/services/config.service.js");
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("channel");
  if (!channel?.isTextBased()) {
    return;
  }

  await fourHourGameService.resyncLastMessage(guildId, channel.id, () =>
    fetchLatestPlayerMessage(channel)
  );
}

export async function syncAllRounds(
  module: Module<FourHourGameConfigSchema>
): Promise<void> {
  const { default: moduleService } =
    await import("#core/services/module.service.js");
  const guildIds = await moduleService.getActivatedGuildIds(module.id);

  for (const guildId of guildIds) {
    try {
      await syncRound(module, guildId);
    } catch (err) {
      logger.warn({ err }, `Could not sync the round | guildId = ${guildId}`);
    }
  }

  logger.info(`Rounds synced | guilds = ${guildIds.length}`);
}
