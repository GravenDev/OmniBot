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
  type ScoredPoint,
} from "./four-hour-game.service.js";
import { fetchWinnerAvatar } from "./winner-avatar.js";

const logger = loggerMaker("four-hour-game");

export interface PointAnnouncement extends ScoredPoint {
  rank: PlayerRank | null;
  avatarUrl: string | null;
}

function footerKey(caughtUp: boolean, counted: boolean): string {
  if (counted) {
    return caughtUp ? "point.caughtUpCountedFrom" : "point.countedFrom";
  }
  return caughtUp ? "point.caughtUpPostedAt" : "point.postedAt";
}

/**
 * `caughtUp`: scored while the bot was down, announced when it restarts. The
 * footer gives the time the duration counts from: the message's own, or for a
 * message back in place, the later one its delay restarted at.
 */
export function buildPointEmbed(
  announcement: PointAnnouncement,
  config: ConfigProvider<FourHourGameConfigSchema>,
  { caughtUp = false }: { caughtUp?: boolean } = {}
): EmbedBuilder {
  const counted = announcement.countedFrom > announcement.heldSince;
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
    .setFooter({ text: config.t(footerKey(caughtUp, counted)) })
    .setTimestamp(counted ? announcement.countedFrom : announcement.heldSince);
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
