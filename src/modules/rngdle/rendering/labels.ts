import { formatInteger } from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { formatPercent } from "#modules/rngdle/scoring/score-table.js";
import { RANKING_PRIOR } from "#modules/rngdle/scoring/stats.js";
import type { ProfileLabels, ServerStatsLabels } from "./cards.js";
import { formatExpected } from "./format.js";
import type { HistoryLabels } from "./history.js";
import type {
  DailyLeaderboardLabels,
  OverallLeaderboardLabels,
} from "./leaderboards.js";
import {
  TIMELINE_TIERS,
  type TimelineLabels,
  type TimelineTier,
} from "./timeline.js";
import { movingWindow, type TrendLabels } from "./trend.js";
import type { VersusLabels } from "./versus.js";

export function dailyLeaderboardLabels(
  t: TFunction,
  locale: string
): DailyLeaderboardLabels {
  return {
    locale,
    title: t("leaderboard.title"),
    averageScore: t("leaderboard.averageScore"),
    players: t("leaderboard.players"),
    worstRoll: t("leaderboard.worstRoll"),
    previous: (value) => t("leaderboard.previous", { value }),
    rollCount: (count) =>
      t("leaderboard.rollCount", {
        count,
        total: formatInteger(count, locale),
      }),
    worstBy: (name, percent) =>
      t("leaderboard.worstBy", {
        name,
        percent: formatPercent(percent, locale),
      }),
    rank: t("leaderboard.header.rank"),
    player: t("leaderboard.header.player"),
    number: t("leaderboard.header.number"),
    score: t("leaderboard.header.score"),
    delta: t("leaderboard.header.delta"),
    placement: t("leaderboard.header.placement"),
    newPlayer: t("leaderboard.newPlayer"),
  };
}

export function overallLeaderboardLabels(
  t: TFunction,
  locale: string
): OverallLeaderboardLabels {
  return {
    locale,
    title: t("overall.title"),
    players: t("overall.players"),
    rolls: t("overall.rolls"),
    averageScore: t("overall.averageScore"),
    perRoll: t("overall.perRoll"),
    rank: t("leaderboard.header.rank"),
    player: t("leaderboard.header.player"),
    ranking: t("overall.header.ranking"),
    rollCount: t("overall.header.rolls"),
    total: t("overall.header.total"),
    index: t("overall.header.index"),
    indexNote: t("overall.indexNote", { prior: RANKING_PRIOR }),
    bestRoll: t("overall.header.bestRoll"),
    number: t("leaderboard.header.number"),
    score: t("leaderboard.header.score"),
  };
}

export function profileLabels(t: TFunction, locale: string): ProfileLabels {
  return {
    locale,
    bestRoll: t("profile.bestRoll"),
    worstRoll: t("profile.worstRoll"),
    roll: (number) => t("profile.roll", { number }),
    averageOver: (count) =>
      t("profile.averageOver", {
        count,
        total: formatInteger(count, locale),
      }),
    averageScore: t("profile.averageScore"),
    streak: t("profile.streak"),
    streakValue: (count) => t("profile.streakValue", { count }),
    streakRecord: (count) => t("profile.streakRecord", { count }),
    maxBadges: t("profile.maxBadges"),
    maxBadgesValue: (count) => t("profile.maxBadgesValue", { count }),
    overallScore: t("profile.overallScore"),
    tierBreakdown: t("profile.tierBreakdown"),
    expected: t("profile.expected"),
    expectedCount: (value) =>
      t("profile.expectedCount", {
        value: formatExpected(locale, value),
      }),
  };
}

export function historyLabels(
  t: TFunction,
  locale: string,
  { page, size, total }: { page: number; size: number; total: number }
): HistoryLabels {
  return {
    locale,
    subtitle: (shown) =>
      page === 1
        ? t("history.subtitle", { count: shown })
        : t("history.subtitlePage", {
            from: (page - 1) * size + 1,
            to: (page - 1) * size + shown,
            total,
          }),
    averageScore: t("history.averageScore"),
    averageTier: (tier) => t("history.averageTier", { tier }),
    placement: t("history.placement"),
    placementValue: (percent) =>
      t(percent > 50 ? "history.top" : "history.bottom", {
        percent: formatPercent(percent, locale),
      }),
    upperHalf: (upper, total) =>
      t("history.upperHalf", { count: upper, total }),
    streak: t("profile.streak"),
    streakValue: (days) => t("profile.streakValue", { count: days }),
    streakRecord: (days) => t("profile.streakRecord", { count: days }),
    date: t("history.header.date"),
    number: t("leaderboard.header.number"),
    score: t("leaderboard.header.score"),
    placementHeader: t("leaderboard.header.placement"),
  };
}

export function timelineLabels(
  t: TFunction,
  locale: string,
  { count, firstRoll }: { count: number; firstRoll: Date }
): TimelineLabels {
  const tierLabels = (prefix: string) =>
    Object.fromEntries(
      TIMELINE_TIERS.map((tier) => [tier, t(`${prefix}.${tier}`)])
    ) as Record<TimelineTier, string>;
  return {
    locale,
    subtitle: t("timeline.subtitle", {
      count,
      total: formatInteger(count, locale),
      since: new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(firstRoll),
    }),
    counts: tierLabels("timeline.count"),
    legend: tierLabels("timeline.legend"),
    expected: (value) =>
      t("timeline.expected", {
        value: formatExpected(locale, value),
      }),
    timeline: t("timeline.title"),
  };
}

export function trendLabels(
  t: TFunction,
  locale: string,
  { days, from, now }: { days: number; from: Date; now: Date }
): TrendLabels {
  const formatDate = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return {
    locale,
    subtitle: t("trend.subtitle", {
      count: days,
      from: (from.getUTCFullYear() === now.getUTCFullYear()
        ? formatDate
        : new Intl.DateTimeFormat(locale, {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })
      ).format(from),
      to: formatDate.format(now),
    }),
    bestRoll: t("profile.bestRoll"),
    worstRoll: t("profile.worstRoll"),
    roll: (number) => t("profile.roll", { number }),
    averageScore: t("profile.averageScore"),
    averageOver: (count) =>
      t("profile.averageOver", {
        count,
        total: formatInteger(count, locale),
      }),
    change: (percent) =>
      t("trend.change", {
        value: `${percent < 0 ? "−" : "+"}${Math.abs(Math.round(percent))}`,
      }),
    previous: t("trend.previous", { count: days }),
    placement: t("history.placement"),
    placementValue: (percent) =>
      t(percent > 50 ? "history.top" : "history.bottom", {
        percent: formatPercent(percent, locale),
      }),
    upperHalf: (upper, total) => t("trend.upperHalf", { count: upper, total }),
    tierBreakdown: t("profile.tierBreakdown"),
    expected: t("profile.expected"),
    expectedCount: (value) =>
      t("profile.expectedCount", {
        value: formatExpected(locale, value),
      }),
    chart: t("trend.chart"),
    midline: t("trend.midline"),
    movingAverage: t("trend.movingAverage", {
      count: movingWindow(days),
    }),
  };
}

export function versusLabels(t: TFunction, locale: string): VersusLabels {
  return {
    locale,
    vs: t("versus.vs"),
    totalScore: t("versus.totalScore"),
    totalRolls: t("versus.totalRolls"),
    averageScore: t("versus.averageScore"),
    bestRoll: t("versus.bestRoll"),
    maxBadges: t("versus.maxBadges"),
    headToHead: t("versus.headToHead"),
    wins: (count) => t("versus.wins", { count }),
    duelDetail: (days, ties) =>
      `${t("versus.commonDays", { count: days })} · ${t("versus.ties", { count: ties })}`,
    noCommonDay: t("versus.noCommonDay"),
  };
}

export function serverStatsLabels(
  t: TFunction,
  locale: string
): ServerStatsLabels {
  return {
    locale,
    title: t("server.title"),
    bestRoll: t("server.bestRoll"),
    worstRoll: t("server.worstRoll"),
    by: (name) => t("server.by", { name }),
    roll: (number) => t("server.roll", { number }),
    totalRolls: t("server.totalRolls"),
    averageScore: t("server.averageScore"),
    overallScore: t("server.overallScore"),
    tierBreakdown: t("server.tierBreakdown"),
    expected: t("server.expected"),
    expectedCount: (value) =>
      t("server.expectedCount", {
        value: formatExpected(locale, value),
      }),
  };
}
