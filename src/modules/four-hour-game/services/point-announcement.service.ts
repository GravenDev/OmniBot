import type { GuildTextBasedChannel } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { buildPointEmbed } from "#modules/four-hour-game/point-announcement.js";
import { ANNOUNCEMENT_OPTIONS } from "#modules/four-hour-game/rendering/announcement.js";
import fourHourGameService, {
  type PlayerRank,
  type ScoredPoint,
} from "./four-hour-game.service.js";
import { fetchWinnerAvatar } from "./winner-avatar.service.js";

const logger = loggerMaker("four-hour-game");

async function fetchRank(
  guildId: string,
  userId: string
): Promise<PlayerRank | null> {
  try {
    return await fourHourGameService.getRank(guildId, userId);
  } catch (err) {
    logger.warn(
      { err },
      `Failed to compute rank | guildId = ${guildId} | userId = ${userId}`
    );
    return null;
  }
}

/**
 * Posts the announcement of a 4h point in the game channel. A caught-up point
 * says so, and shows no rank: computed once every caught-up point is written,
 * it would not match the total shown.
 */
export async function announcePoint(
  channel: GuildTextBasedChannel,
  point: ScoredPoint,
  config: ConfigProvider<FourHourGameConfigSchema>,
  { caughtUp = false }: { caughtUp?: boolean } = {}
): Promise<void> {
  const [rank, avatarUrl] = await Promise.all([
    caughtUp ? null : fetchRank(channel.guildId, point.winnerId),
    fetchWinnerAvatar(channel.guild, point.winnerId),
  ]);
  await channel.send({
    embeds: [
      buildPointEmbed({ ...point, rank, avatarUrl }, config, { caughtUp }),
    ],
    ...ANNOUNCEMENT_OPTIONS,
  });
}
