import type { Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { presentGuilds } from "#lib/guild-loop.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareService, type Service } from "#lib/service.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import channelHistoryService from "./channel-history.service.js";
import fourHourGameService from "./four-hour-game.service.js";
import pointAnnouncementService from "./point-announcement.service.js";

const logger = loggerMaker("four-hour-game");

class RoundSyncService implements Service {
  /**
   * Replays the guild's downtime, in its queue taken on the call, then
   * announces the points. Nothing is replayed when `activated`, awaited within
   * the queue, turns out false.
   */
  syncRound(
    module: Module<FourHourGameConfigSchema>,
    guildId: string,
    activated: Promise<boolean> = Promise.resolve(true)
  ): Promise<void> {
    return fourHourGameService.syncRound(guildId, async () => {
      if (!(await activated)) {
        return null;
      }
      const config = await configService.getConfigForModuleIn(module, guildId);
      const channel = config.get("channel");
      const delaySeconds = config.get("delay");
      // Without a delay, the game is off: live messages are ignored too.
      if (!channel?.isTextBased() || channel.isDMBased() || delaySeconds <= 0) {
        return null;
      }
      return {
        channelId: channel.id,
        history: {
          latest: () => channelHistoryService.fetchPlayerMessages(channel),
          since: (since) =>
            channelHistoryService.fetchPlayerMessagesSince(channel, since),
        },
        delaySeconds,
        announce: async (points) => {
          // In sequence: the points are announced in the order they were scored.
          for (const point of points) {
            try {
              await pointAnnouncementService.announcePoint(
                channel,
                point,
                config,
                { caughtUp: true }
              );
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
  syncAllRounds(
    client: Client,
    module: Module<FourHourGameConfigSchema>
  ): {
    reserved: Promise<void>;
    done: Promise<void>;
  } {
    const syncs = moduleService
      .getActivatedGuildIds(module.id)
      .then((guildIds) =>
        presentGuilds(client, guildIds, {
          action: "sync the round",
          logger,
        }).map(({ id: guildId }) =>
          this.syncRound(module, guildId).catch((err: unknown) =>
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
}

export default declareService(new RoundSyncService());
