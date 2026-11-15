import type { EmbedBuilder } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { buildAnnouncementEmbed } from "#modules/four-hour-game/rendering/announcement.js";
import { formatHeldTime } from "./formatting.js";
import type {
  DailyPoint,
  PlayerRank,
  ScoredPoint,
} from "./four-hour-game.service.js";

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
 * `caughtUp`: scored while the bot was away (stopped, or removed from the
 * guild), announced once it is back. The footer gives the time the duration
 * counts from: the message's own, or for a message back in place, the later
 * one its delay restarted at.
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

export interface DailyPointAnnouncement extends DailyPoint {
  total: number;
  rank: PlayerRank | null;
  avatarUrl: string | null;
}

export function buildDailyPointEmbed(
  announcement: DailyPointAnnouncement,
  config: ConfigProvider<FourHourGameConfigSchema>
): EmbedBuilder {
  const date = new Intl.DateTimeFormat(config.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${announcement.day}T00:00:00Z`));
  return buildAnnouncementEmbed(
    {
      title: config.t("daily.title"),
      headline: config.t("daily.description", {
        user: `<@${announcement.userId}>`,
        date,
        duration: formatHeldTime(announcement.heldSeconds, config.t),
      }),
      total: config.t("daily.total", { count: announcement.total }),
      rank: announcement.rank,
      avatarUrl: announcement.avatarUrl,
    },
    config.t
  );
}
