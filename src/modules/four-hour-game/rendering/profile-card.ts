import type { Image } from "@napi-rs/canvas";
import type { TFunction } from "#lib/i18n.js";
import { renderStatCard, type StatCard } from "#lib/stat-card.js";
import formatting from "#modules/four-hour-game/services/formatting.service.js";
import type { PlayerProfile } from "#modules/four-hour-game/services/four-hour-game.service.js";

const MISSING = "—";

export interface ProfilePlayer {
  name: string;
  avatar: Image | null;
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value).replace(/[  ]/g, " ");
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
          value: formatNumber(profile.score, locale),
        },
        {
          title: t("profile.month"),
          value: known(formatNumber(profile.monthPoints, locale)),
        },
        {
          title: t("profile.bestHold"),
          value:
            profile.bestHoldSeconds === null
              ? MISSING
              : formatting.formatHeldTime(profile.bestHoldSeconds, t),
        },
      ],
      [
        {
          title: t("profile.streak"),
          value: known(formatNumber(profile.currentStreak, locale)),
          ...(hasHistory && {
            subtext: t("profile.streakRecord", {
              record: formatNumber(profile.bestStreak, locale),
            }),
          }),
        },
        {
          title: t("profile.lastPoint"),
          value: profile.lastPointAt
            ? formatDate.format(profile.lastPointAt)
            : MISSING,
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
