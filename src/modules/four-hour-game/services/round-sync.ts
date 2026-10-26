import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import {
  fetchPlayerMessages,
  fetchPlayerMessagesSince,
} from "./channel-history.js";
import fourHourGameService from "./four-hour-game.service.js";
import { announcePoint } from "./point-announcement.js";

const logger = loggerMaker("four-hour-game");

export async function syncRound(
  module: Module<FourHourGameConfigSchema>,
  guildId: string
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("channel");
  if (!channel?.isTextBased() || channel.isDMBased()) {
    return;
  }

  const points = await fourHourGameService.resyncLastMessage(
    guildId,
    channel.id,
    {
      latest: () => fetchPlayerMessages(channel),
      since: (since) => fetchPlayerMessagesSince(channel, since),
    },
    config.get("delay")
  );
  // The points scored while down are announced like live ones, in order.
  for (const point of points) {
    try {
      await announcePoint(channel, point, config);
    } catch (err) {
      logger.warn(
        { err },
        `Could not announce a caught-up point | guildId = ${guildId} | userId = ${point.winnerId}`
      );
    }
  }
}

export async function syncAllRounds(
  module: Module<FourHourGameConfigSchema>
): Promise<void> {
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
