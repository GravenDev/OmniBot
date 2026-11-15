import type { Image } from "@napi-rs/canvas";
import {
  decimalSeparator,
  formatInteger,
  formatPercentage,
} from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { renderStatCard } from "#lib/stat-card.js";
import { renderBoard } from "#modules/clash-of-code/rendering/board.js";
import { formatDuration } from "#modules/clash-of-code/rendering/format.js";
import { renderResult } from "#modules/clash-of-code/rendering/result.js";
import { ACCENT } from "#modules/clash-of-code/rendering/theme.js";
import type { ClashMode, ClashReport } from "./api.js";
import type { PlayerStats, Standing, StoredPlayer } from "./stats.js";

export const PAGE_SIZE = 10;
export const RESULT_MAX_ROWS = 20;

export function modeLabel(t: TFunction, mode: ClashMode | null): string {
  return mode ? t(`mode.${mode}`) : t("mode.unknown");
}

export interface StandingsPage {
  page: number;
  pageCount: number;
  shown: Standing[];
  /** The caller's standing, when they play but are not on the page shown. */
  callerStanding: Standing | undefined;
}

/**
 * The leaderboard page asked for, kept within the pages there are, with the
 * caller's own standing when it is elsewhere; null when nobody played.
 */
export function standingsPage(
  standings: Standing[],
  requestedPage: number,
  callerCodingamerId: number | null
): StandingsPage | null {
  if (standings.length === 0) {
    return null;
  }

  const pageCount = Math.ceil(standings.length / PAGE_SIZE);
  const page = Math.min(Math.max(Math.trunc(requestedPage), 1), pageCount);
  const shown = standings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const callerStanding =
    callerCodingamerId !== null &&
    !shown.some((row) => row.codingamerId === callerCodingamerId)
      ? standings.find((row) => row.codingamerId === callerCodingamerId)
      : undefined;
  return { page, pageCount, shown, callerStanding };
}

/** The result of a finished game; `avatars` follow its first players. */
export function resultCard(
  t: TFunction,
  locale: string,
  report: ClashReport,
  icon: Image | null,
  avatars: (Image | null)[]
): Promise<Buffer> {
  const players = report.players.slice(0, RESULT_MAX_ROWS);
  return renderResult(
    report.mode,
    icon,
    players.map((player, index) => ({
      rank: player.rank,
      name: player.nickname,
      avatar: avatars[index] ?? null,
      score: player.score,
      durationMs: player.durationMs,
      criterion: player.criterion,
    })),
    {
      locale,
      title: t("card.title"),
      subtitle: t("result.subtitle", {
        mode: modeLabel(t, report.mode),
        count: report.players.length,
      }),
      rank: t("table.rank"),
      player: t("table.player"),
      score: t("table.score"),
      time: t("table.time"),
      characters: t("table.characters"),
    }
  );
}

/** A leaderboard page, the players and avatars by CodinGame id. */
export function leaderboardCard(
  t: TFunction,
  locale: string,
  mode: ClashMode | null,
  { shown, callerStanding }: StandingsPage,
  players: ReadonlyMap<number, StoredPlayer>,
  avatars: ReadonlyMap<number, Image | null>,
  icon: Image | null
): Promise<Buffer> {
  const toRow = (standing: Standing) => ({
    ...standing,
    name: players.get(standing.codingamerId)?.nickname ?? "?",
    avatar: avatars.get(standing.codingamerId) ?? null,
  });

  return renderBoard({
    icon,
    title: t("card.title"),
    subtitle: t("leaderboard.subtitle", {
      mode: mode ? modeLabel(t, mode) : t("mode.all"),
    }),
    headers: {
      rank: t("table.rank"),
      player: t("table.player"),
    },
    // Wins and games, up to 4 digits under headers of about 80 px.
    nameWidth: 350,
    columns: [
      {
        header: t("table.wins"),
        right: 130,
        text: (row) => formatInteger(row.wins, locale),
        accent: true,
      },
      {
        header: t("table.games"),
        right: 0,
        text: (row) => formatInteger(row.games, locale),
      },
    ],
    rows: shown.map(toRow),
    extra: callerStanding && toRow(callerStanding),
  });
}

/** A player's profile; `rank` is their standing among `total` players. */
export function profileStatCard(
  t: TFunction,
  locale: string,
  player: StoredPlayer,
  stats: PlayerStats,
  rank: { position: number; total: number } | null,
  avatar: Image | null
): Promise<Buffer> {
  return renderStatCard({
    image: avatar,
    title: player.nickname,
    subtitle: player.userId
      ? t("profile.subtitleLinked")
      : t("profile.subtitle"),
    ...(rank && { rank }),
    rows: [
      [
        {
          title: t("profile.games"),
          value: formatInteger(stats.games, locale),
        },
        { title: t("profile.wins"), value: formatInteger(stats.wins, locale) },
        {
          title: t("profile.winRate"),
          value: formatPercentage(stats.winRate * 100, locale),
          highlight: true,
        },
      ],
      [
        {
          title: t("profile.averageRank"),
          value: stats.averageRank
            .toFixed(1)
            .replace(".", decimalSeparator(locale)),
        },
        {
          title: t("profile.averageScore"),
          value: formatPercentage(stats.averageScore, locale),
        },
        {
          title: t("profile.averageTime"),
          value: formatDuration(stats.averageDurationMs),
        },
      ],
    ],
    accent: ACCENT,
  });
}
