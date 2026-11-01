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

/** Replays the guild's downtime, in its queue, then announces the points. */
export function syncRound(
  module: Module<FourHourGameConfigSchema>,
  guildId: string
): Promise<void> {
  return fourHourGameService.syncRound(guildId, async () => {
    const config = await configService.getConfigForModuleIn(module, guildId);
    const channel = config.get("channel");
    const delaySeconds = config.get("delay");
    // Without a delay, the game is off: live messages are ignored too.
    if (!channel?.isTextBased() || channel.isDMBased() || !(delaySeconds > 0)) {
      return null;
    }
    return {
      channelId: channel.id,
      history: {
        latest: () => fetchPlayerMessages(channel),
        since: (since) => fetchPlayerMessagesSince(channel, since),
      },
      delaySeconds,
      announce: async (points) => {
        for (const point of points) {
          try {
            await announcePoint(channel, point, config, { caughtUp: true });
          } catch (err) {
            logger.warn(
              { err },
              `Could not announce a caught-up point | guildId = ${guildId} | userId = ${point.winnerId}`
            );
          }
        }
      },
    };
  });
}

/**
 * Replays every activated guild at once, each in its own queue: `reserved`
 * once every queue is taken, `done` once every replay is over.
 */
export function syncAllRounds(module: Module<FourHourGameConfigSchema>): {
  reserved: Promise<void>;
  done: Promise<void>;
} {
  const syncs = moduleService
    .getActivatedGuildIds(module.id)
    .then((guildIds) =>
      guildIds.map((guildId) =>
        syncRound(module, guildId).catch((err: unknown) =>
          logger.warn(
            { err },
            `Could not sync the round | guildId = ${guildId}`
          )
        )
      )
    );
  return {
    reserved: syncs.then(() => undefined),
    done: syncs.then(async (all) => {
      await Promise.all(all);
      logger.info(`Rounds synced | guilds = ${all.length}`);
    }),
  };
}
