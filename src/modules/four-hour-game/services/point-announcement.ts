import type { EmbedBuilder, GuildTextBasedChannel } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import {
  ANNOUNCEMENT_OPTIONS,
  buildAnnouncementEmbed,
} from "#modules/four-hour-game/rendering/announcement.js";
import { formatHeldTime } from "./formatting.js";
import fourHourGameService, {
  type PlayerRank,
} from "./four-hour-game.service.js";
import { fetchWinnerAvatar } from "./winner-avatar.js";

const logger = loggerMaker("four-hour-game");

export interface ScoredPoint {
  winnerId: string;
  score: number;
  heldSeconds: number;
  heldSince: Date;
}

export interface PointAnnouncement extends ScoredPoint {
  rank: PlayerRank | null;
  avatarUrl: string | null;
}

export function buildPointEmbed(
  announcement: PointAnnouncement,
  config: ConfigProvider<FourHourGameConfigSchema>
): EmbedBuilder {
  return buildAnnouncementEmbed(
    {
      title: config.t("point.title"),
      headline: config.t("point.description", {
        user: `<@${announcement.winnerId}>`,
        duration: formatHeldTime(announcement.heldSeconds, config.t),
      }),
      total: config.t("point.total", { count: announcement.score }),
      rank: announcement.rank,
      avatarUrl: announcement.avatarUrl,
    },
    config.t
  )
    .setFooter({ text: config.t("point.postedAt") })
    .setTimestamp(announcement.heldSince);
}

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

/** Posts the announcement of a 4h point in the game channel. */
export async function announcePoint(
  channel: GuildTextBasedChannel,
  point: ScoredPoint,
  config: ConfigProvider<FourHourGameConfigSchema>
): Promise<void> {
  const [rank, avatarUrl] = await Promise.all([
    fetchRank(channel.guildId, point.winnerId),
    fetchWinnerAvatar(channel.guild, point.winnerId),
  ]);
  await channel.send({
    embeds: [buildPointEmbed({ ...point, rank, avatarUrl }, config)],
    ...ANNOUNCEMENT_OPTIONS,
  });
}
