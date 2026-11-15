import type { Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { forEachGuild } from "#lib/guild-loop.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { ANNOUNCEMENT_OPTIONS } from "#modules/four-hour-game/rendering/announcement.js";
import fourHourGameService from "./four-hour-game.service.js";
import { buildDailyPointEmbed } from "./point-announcement.js";
import { fetchWinnerAvatar } from "./winner-avatar.js";

const logger = loggerMaker("four-hour-game");

export async function closeDays(
  module: Module<FourHourGameConfigSchema>,
  guildId: string
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("channel");
  const points = await fourHourGameService.closeDays(
    guildId,
    channel?.id ?? null
  );
  if (points.length === 0) {
    logger.debug(`No daily point to announce | guildId = ${guildId}`);
    return;
  }
  // A configured channel is always a guild channel: isDMBased() only narrows
  // the type, so the avatars can be taken through channel.guild.
  if (!channel?.isSendable() || channel.isDMBased()) {
    logger[channel ? "warn" : "debug"](
      `Daily points not announced | reason = ${channel ? "game channel not sendable" : "no game channel"} | guildId = ${guildId} | channelId = ${channel?.id ?? "none"} | count = ${points.length}`
    );
    return;
  }
  logger.info(
    `Closing days | guildId = ${guildId} | channelId = ${channel.id} | count = ${points.length}`
  );

  for (const point of points) {
    try {
      // The standings at the end of that day, not today's.
      const { score, rank } = await fourHourGameService.getDailyRank(
        guildId,
        point.userId,
        point.day
      );
      await channel.send({
        embeds: [
          buildDailyPointEmbed(
            {
              ...point,
              total: score,
              rank,
              avatarUrl: await fetchWinnerAvatar(channel.guild, point.userId),
            },
            config
          ),
        ],
        ...ANNOUNCEMENT_OPTIONS,
      });
      logger.info(
        `Daily point announced | guildId = ${guildId} | day = ${point.day} | userId = ${point.userId}`
      );
    } catch (err) {
      logger.error(
        { err },
        `Failed to announce the daily point | guildId = ${guildId} | day = ${point.day}`
      );
    }
  }
}

export async function closeAllDays(
  client: Client,
  module: Module<FourHourGameConfigSchema>
): Promise<void> {
  await forEachGuild(
    client,
    await moduleService.getActivatedGuildIds(module.id),
    (guild) => closeDays(module, guild.id),
    { action: "close the day", logger }
  );
}
