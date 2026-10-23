import type { Image } from "@napi-rs/canvas";
import { formatInteger } from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { renderStatCard, type StatCard } from "#lib/stat-card.js";
import { formatHeldTime } from "#modules/four-hour-game/services/formatting.js";
import type { PlayerProfile } from "#modules/four-hour-game/services/four-hour-game.service.js";
import { ACCENT } from "./theme.js";

const MISSING = "—";

export interface ProfilePlayer {
  name: string;
  avatar: Image | null;
}

export function buildProfileCard(
  profile: PlayerProfile,
  player: ProfilePlayer,
  t: TFunction,
  locale: string
): StatCard {
  const hasHistory = profile.lastPointAt !== null;
  const known = (value: string) => (hasHistory ? value : MISSING);
  const formatDate = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    accent: ACCENT,
    image: player.avatar,
    title: player.name,
    subtitle: t("profile.subtitle"),
    ...(profile.rank > 0 && {
      rank: { position: profile.rank, total: profile.total },
    }),
    rows: [
      [
        {
          title: t("profile.points"),
          value: formatInteger(profile.score, locale),
        },
        {
          title: t("profile.month"),
          value: known(formatInteger(profile.monthPoints, locale)),
        },
        {
          title: t("profile.bestHold"),
          value:
            profile.bestHoldSeconds === null
              ? MISSING
              : formatHeldTime(profile.bestHoldSeconds, t),
        },
      ],
      [
        {
          title: t("profile.streak"),
          value: known(formatInteger(profile.currentStreak, locale)),
          ...(hasHistory && {
            subtext: t("profile.streakRecord", {
              record: formatInteger(profile.bestStreak, locale),
            }),
          }),
        },
        {
          title: t("profile.lastPoint"),
          value: profile.lastPointAt
            ? formatDate.format(profile.lastPointAt)
            : MISSING,
        },
        {
          title: t("profile.daily"),
          value: formatInteger(profile.dailyPoints, locale),
          ...(profile.dailyRank && {
            subtext: t("profile.dailyRank", {
              rank: profile.dailyRank.rank,
              total: profile.dailyRank.total,
            }),
          }),
        },
      ],
    ],
  };
}

export function renderProfileCard(
  profile: PlayerProfile,
  player: ProfilePlayer,
  t: TFunction,
  locale: string
): Promise<Buffer> {
  return renderStatCard(buildProfileCard(profile, player, t, locale));
}
