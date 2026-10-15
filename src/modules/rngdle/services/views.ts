import type { Image } from "@napi-rs/canvas";
import type { Client, Guild } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { fetchImage } from "#lib/imaging.js";
import { resolvePlayers } from "#lib/players.js";
import { RevisionCache } from "#lib/revision-cache.js";
import {
  renderProfile,
  renderServerStats,
} from "#modules/rngdle/rendering/cards.js";
import {
  formatExpected,
  formatSpaced,
} from "#modules/rngdle/rendering/format.js";
import { renderHistory } from "#modules/rngdle/rendering/history.js";
import {
  renderDailyLeaderboard,
  renderOverallLeaderboard,
} from "#modules/rngdle/rendering/leaderboards.js";
import {
  renderVersus,
  type VersusPlayer,
} from "#modules/rngdle/rendering/versus.js";
import { computeDailyRecap, type DailyRecap } from "./recap.js";
import { formatPercent, TIERS, type Tier } from "./scoring.js";
import {
  byBestRoll,
  computeRanking,
  computeRollStats,
  computeServerStats,
  computeStreaks,
  RANKING_PRIOR,
} from "./stats.js";
import store, {
  type Account,
  type DateRange,
  type StoredRoll,
} from "./store.js";
import { computeVersus, type VersusSide } from "./versus.js";

const DAILY_SIZE = 25;
const OVERALL_PAGE_SIZE = 10;
export const HISTORY_SIZE = 10;
export const HISTORY_MIN = 5;
export const HISTORY_MAX = 15;
const CACHE_TTL_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const cache = new RevisionCache(CACHE_TTL_MS);

export interface ViewContext {
  client: Client;
  guildId: string;
  t: TFunction;
  locale: string;
}

export const PERIODS = ["all", "month", "week"] as const;

export type Period = (typeof PERIODS)[number];

export function parsePeriod(value: string | null | undefined): Period {
  return PERIODS.find((period) => period === value) ?? "all";
}

export interface DailyLeaderboard {
  image: Buffer;
  winnerIds: string[];
}

export interface OverallPage {
  image: Buffer;
  page: number;
  pageCount: number;
}

function cached<T>(context: ViewContext, key: string, load: () => Promise<T>) {
  return cache.get(
    `${context.guildId}:${context.locale}:${key}`,
    store.revision(context.guildId),
    load
  );
}

export function utcDayRange(daysAgo: number, now = new Date()): [Date, Date] {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysAgo
  );
  return [new Date(start), new Date(start + DAY_MS)];
}

export function periodRange(period: Period, now = new Date()): DateRange {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (period === "month") {
    return {
      from: new Date(Date.UTC(year, month, 1)),
      to: new Date(Date.UTC(year, month + 1, 1)),
    };
  }
  if (period === "week") {
    const sinceMonday = (now.getUTCDay() + 6) % 7;
    const start = Date.UTC(year, month, now.getUTCDate() - sinceMonday);
    return { from: new Date(start), to: new Date(start + 7 * DAY_MS) };
  }
  return {};
}

function utcDayKey(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

function averageScore(rolls: StoredRoll[]): number {
  return Math.trunc(
    rolls.reduce((sum, roll) => sum + roll.score, 0) / rolls.length
  );
}

async function guildIcon(context: ViewContext): Promise<Image | null> {
  const guild =
    context.client.guilds.cache.get(context.guildId) ??
    (await context.client.guilds.fetch(context.guildId).catch(() => null));
  return fetchImage(guild?.iconURL({ extension: "png", size: 128 }) ?? null);
}

export function periodText(
  context: Pick<ViewContext, "t" | "locale">,
  period: Period,
  now = new Date(),
  prefix = "overall.period"
): string {
  const { from, to } = periodRange(period, now);
  if (period === "month" && from) {
    const month = new Intl.DateTimeFormat(context.locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(from);
    return context.t(`${prefix}.month`, { month });
  }
  if (period === "week" && from && to) {
    const format = new Intl.DateTimeFormat(context.locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return context.t(`${prefix}.week`, {
      from: format.format(from),
      to: format.format(new Date(to.getTime() - DAY_MS)),
    });
  }
  return context.t(`${prefix}.all`);
}

export function dailyLeaderboard(
  context: ViewContext,
  daysAgo: number
): Promise<DailyLeaderboard | null> {
  const [from, to] = utcDayRange(daysAgo);
  const [previousFrom] = utcDayRange(daysAgo + 1);
  return cached(context, `daily:${from.toISOString()}`, async () => {
    const [rolls, previousRolls, table, accounts] = await Promise.all([
      store.rolls(context.guildId, { from, to, byScore: true }),
      store.rolls(context.guildId, { from: previousFrom, to: from }),
      store.scoreTable(),
      store.accounts(context.guildId),
    ]);
    const best = rolls[0]?.score;
    if (best === undefined) {
      return null;
    }

    const top = rolls.slice(0, DAILY_SIZE);
    const worst = rolls.at(-1)!;
    const playerCount = new Set(rolls.map((roll) => roll.userId)).size;
    const showWorst = playerCount > 1 && worst.score < best;
    const previousBest = new Map<string, number>();
    for (const roll of previousRolls) {
      previousBest.set(
        roll.userId,
        Math.max(previousBest.get(roll.userId) ?? roll.score, roll.score)
      );
    }

    const usernames = new Map(accounts.map((a) => [a.userId, a.username]));
    const [players, icon] = await Promise.all([
      resolvePlayers(context.client, context.guildId, [
        ...top.map((roll) => roll.userId),
        ...(showWorst ? [worst.userId] : []),
      ]),
      guildIcon(context),
    ]);
    const nameOf = (userId: string) =>
      players.get(userId)?.name ?? usernames.get(userId) ?? "?";
    const rows = top.map((roll, index) => {
      const previous = previousBest.get(roll.userId);
      return {
        rank: index + 1,
        name: nameOf(roll.userId),
        avatar: players.get(roll.userId)?.avatar ?? null,
        number: roll.number,
        score: roll.score,
        percent: table.percentOf(roll.score),
        tier: table.tierOf(roll.score),
        delta: previous === undefined ? null : roll.score - previous,
      };
    });
    const average = averageScore(rolls);
    const hadPrevious = previousRolls.length > 0;

    const { t } = context;
    return {
      image: await renderDailyLeaderboard(
        {
          icon,
          subtitle: t("leaderboard.subtitle", {
            date: new Intl.DateTimeFormat(context.locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }).format(from),
          }),
          rows,
          average: {
            score: average,
            tier: table.tierOf(average),
            rolls: rolls.length,
            previous: hadPrevious ? averageScore(previousRolls) : null,
          },
          players: {
            count: playerCount,
            previous: hadPrevious
              ? new Set(previousRolls.map((roll) => roll.userId)).size
              : null,
          },
          worst: showWorst
            ? {
                name: nameOf(worst.userId),
                avatar: players.get(worst.userId)?.avatar ?? null,
                score: worst.score,
                percent: table.percentOf(worst.score),
              }
            : null,
        },
        {
          title: t("leaderboard.title"),
          averageScore: t("leaderboard.averageScore"),
          players: t("leaderboard.players"),
          worstRoll: t("leaderboard.worstRoll"),
          previous: (value) => t("leaderboard.previous", { value }),
          rollCount: (count) =>
            t("leaderboard.rollCount", { count, total: formatSpaced(count) }),
          worstBy: (name, percent) =>
            t("leaderboard.worstBy", {
              name,
              percent: formatPercent(percent),
            }),
          player: t("leaderboard.header.player"),
          number: t("leaderboard.header.number"),
          score: t("leaderboard.header.score"),
          delta: t("leaderboard.header.delta"),
          placement: t("leaderboard.header.placement"),
          newPlayer: t("leaderboard.newPlayer"),
        }
      ),
      winnerIds: [
        ...new Set(
          rolls.filter((roll) => roll.score === best).map((roll) => roll.userId)
        ),
      ],
    };
  });
}

export async function dailyRecap(
  guildId: string,
  daysAgo: number
): Promise<DailyRecap | null> {
  const [from, to] = utcDayRange(daysAgo);
  const [history, table] = await Promise.all([
    store.rolls(guildId, { to }),
    store.scoreTable(),
  ]);
  return computeDailyRecap(history, from, table);
}

export function overallPage(
  context: ViewContext,
  requestedPage: number,
  callerId: string,
  period: Period = "all",
  now: Date = new Date()
): Promise<OverallPage | null> {
  const range = periodRange(period, now);
  const key = `overall:${period}:${range.from?.toISOString() ?? ""}:${requestedPage}:${callerId}`;
  return cached(context, key, async () => {
    const [rolls, accounts, table] = await Promise.all([
      store.rolls(context.guildId, range),
      store.accounts(context.guildId),
      store.scoreTable(),
    ]);
    const ranking = computeRanking(rolls);
    if (ranking.length === 0) {
      return null;
    }
    const bestRolls = byBestRoll(ranking);

    const pageCount = Math.ceil(ranking.length / OVERALL_PAGE_SIZE);
    const page = Math.min(Math.max(requestedPage, 1), pageCount);
    const start = (page - 1) * OVERALL_PAGE_SIZE;
    const end = start + OVERALL_PAGE_SIZE;
    const callerIndex = ranking.findIndex((entry) => entry.userId === callerId);
    const callerOffPage =
      callerIndex >= 0 && (callerIndex < start || callerIndex >= end);
    const shownRanking = ranking.slice(start, end);
    const shownBest = bestRolls.slice(start, end);

    const usernames = new Map(accounts.map((a) => [a.userId, a.username]));
    const [players, icon] = await Promise.all([
      resolvePlayers(context.client, context.guildId, [
        ...shownRanking.map((entry) => entry.userId),
        ...shownBest.map((entry) => entry.userId),
        ...(callerOffPage ? [callerId] : []),
      ]),
      guildIcon(context),
    ]);
    const player = (userId: string, rank: number) => ({
      rank,
      name: players.get(userId)?.name ?? usernames.get(userId) ?? "?",
      avatar: players.get(userId)?.avatar ?? null,
    });
    const toRankingRow = (index: number) => {
      const entry = ranking[index]!;
      return {
        ...player(entry.userId, index + 1),
        rolls: entry.rolls,
        total: entry.total,
        index: entry.index,
      };
    };
    const average = averageScore(rolls);
    const { t } = context;

    const image = await renderOverallLeaderboard(
      {
        icon,
        subtitle: periodText(context, period, now, "overall.subtitle"),
        players: ranking.length,
        rolls: rolls.length,
        average: { score: average, tier: table.tierOf(average) },
        ranking: shownRanking.map((_, offset) => toRankingRow(start + offset)),
        caller: callerOffPage ? toRankingRow(callerIndex) : undefined,
        bestRolls: shownBest.map((entry, offset) => ({
          ...player(entry.userId, start + offset + 1),
          number: entry.best.number,
          score: entry.best.score,
          tier: table.tierOf(entry.best.score),
        })),
      },
      {
        title: t("overall.title"),
        players: t("overall.players"),
        rolls: t("overall.rolls"),
        averageScore: t("overall.averageScore"),
        perRoll: t("overall.perRoll"),
        ranking: t("overall.header.ranking"),
        rollCount: t("overall.header.rolls"),
        total: t("overall.header.total"),
        index: t("overall.header.index"),
        indexNote: t("overall.indexNote", { prior: RANKING_PRIOR }),
        bestRoll: t("overall.header.bestRoll"),
        number: t("leaderboard.header.number"),
        score: t("leaderboard.header.score"),
      }
    );
    return { image, page, pageCount };
  });
}

export function profileCard(
  context: ViewContext,
  account: Account
): Promise<Buffer | null> {
  return cached(context, `profile:${account.userId}`, async () => {
    const [guildRolls, accounts, table] = await Promise.all([
      store.rolls(account.guildId),
      store.accounts(account.guildId),
      store.scoreTable(),
    ]);
    const rolls = guildRolls.filter((roll) => roll.userId === account.userId);
    const stats = computeRollStats(rolls, table);
    if (!stats) {
      return null;
    }
    const streaks = computeStreaks(rolls, new Date());

    const player = (
      await resolvePlayers(context.client, context.guildId, [account.userId])
    ).get(account.userId);
    const formatDate = new Intl.DateTimeFormat(context.locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const toRoll = (roll: typeof stats.best) => ({
      number: roll.number,
      score: roll.score,
      tier: table.tierOf(roll.score),
      dateText: formatDate.format(roll.rolledAt),
    });
    const { t } = context;

    return renderProfile(
      {
        username: player?.name ?? account.username,
        avatar: player?.avatar ?? null,
        serverRank:
          computeRanking(guildRolls).findIndex(
            (entry) => entry.userId === account.userId
          ) + 1,
        totalPlayers: accounts.length,
        best: toRoll(stats.best),
        worst: toRoll(stats.worst),
        totalRolls: stats.totalRolls,
        averageScore: stats.averageScore,
        averageTier: table.tierOf(stats.averageScore),
        maxBadges: stats.maxBadges,
        totalScore: stats.totalScore,
        currentStreak: streaks.current,
        bestStreak: streaks.best,
        tierCounts: stats.tierCounts,
      },
      {
        bestRoll: t("profile.bestRoll"),
        worstRoll: t("profile.worstRoll"),
        roll: (number) => t("profile.roll", { number }),
        averageOver: (count) =>
          t("profile.averageOver", { count, total: formatSpaced(count) }),
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
            value: formatExpected(context.locale, value),
          }),
      }
    );
  });
}

export function historyCard(
  context: ViewContext,
  account: Account,
  count: number = HISTORY_SIZE,
  now: Date = new Date()
): Promise<Buffer | null> {
  const size = Math.min(Math.max(count, HISTORY_MIN), HISTORY_MAX);
  const today = utcDayKey(now);
  const key = `history:${account.userId}:${size}:${today}`;
  return cached(context, key, async () => {
    const [rolls, table] = await Promise.all([
      store.rolls(account.guildId, { userId: account.userId }),
      store.scoreTable(),
    ]);
    const recent = rolls.slice(-size).reverse();
    if (recent.length === 0) {
      return null;
    }

    const player = (
      await resolvePlayers(context.client, context.guildId, [account.userId])
    ).get(account.userId);
    const formatDate = new Intl.DateTimeFormat(context.locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const { t } = context;
    const rows = recent.map((roll) => {
      const isToday = utcDayKey(roll.rolledAt) === today;
      return {
        dateText: isToday
          ? t("history.today")
          : formatDate.format(roll.rolledAt),
        today: isToday,
        number: roll.number,
        score: roll.score,
        percent: table.percentOf(roll.score),
        tier: table.tierOf(roll.score),
      };
    });
    const average = averageScore(recent);
    const streaks = computeStreaks(rolls, now);

    return renderHistory(
      {
        username: player?.name ?? account.username,
        avatar: player?.avatar ?? null,
        rows,
        averageScore: average,
        averageTier: table.tierOf(average),
        averagePercent:
          rows.reduce((sum, row) => sum + row.percent, 0) / rows.length,
        upperHalf: rows.filter((row) => row.percent > 50).length,
        currentStreak: streaks.current,
        bestStreak: streaks.best,
      },
      {
        subtitle: (shown) => t("history.subtitle", { count: shown }),
        averageScore: t("history.averageScore"),
        averageTier: (tier) => t("history.averageTier", { tier }),
        placement: t("history.placement"),
        placementValue: (percent) =>
          t(percent > 50 ? "history.top" : "history.bottom", {
            percent: formatPercent(percent),
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
      }
    );
  });
}

export function versusCard(
  context: ViewContext,
  left: Account,
  right: Account
): Promise<Buffer | null> {
  return cached(context, `versus:${left.userId}:${right.userId}`, async () => {
    const [leftRolls, rightRolls, table] = await Promise.all([
      store.rolls(context.guildId, { userId: left.userId }),
      store.rolls(context.guildId, { userId: right.userId }),
      store.scoreTable(),
    ]);
    const versus = computeVersus(leftRolls, rightRolls);
    if (!versus) {
      return null;
    }

    const players = await resolvePlayers(context.client, context.guildId, [
      left.userId,
      right.userId,
    ]);
    const toPlayer = (account: Account, side: VersusSide): VersusPlayer => {
      const player = players.get(account.userId);
      return {
        name: player?.name ?? account.username,
        avatar: player?.avatar ?? null,
        totalScore: side.totalScore,
        totalRolls: side.totalRolls,
        average:
          side.averageScore === null
            ? null
            : {
                score: side.averageScore,
                tier: table.tierOf(side.averageScore),
              },
        best: side.best && {
          ...side.best,
          tier: table.tierOf(side.best.score),
        },
        maxBadges: side.maxBadges,
      };
    };
    const { t } = context;

    return renderVersus(
      {
        left: toPlayer(left, versus.left),
        right: toPlayer(right, versus.right),
        headToHead: versus.headToHead,
        winners: versus.winners,
      },
      {
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
      }
    );
  });
}

export function serverCard(
  context: ViewContext,
  guild: Guild
): Promise<Buffer | null> {
  return cached(context, "server", async () => {
    const [rolls, accounts, table] = await Promise.all([
      store.rolls(guild.id),
      store.accounts(guild.id),
      store.scoreTable(),
    ]);
    const stats = computeServerStats(rolls, table);
    if (!stats) {
      return null;
    }

    const players = await resolvePlayers(context.client, context.guildId, [
      stats.best.userId,
      stats.worst.userId,
      ...TIERS.flatMap((tier) => stats.tierLeaders[tier]),
    ]);
    const usernames = new Map(accounts.map((a) => [a.userId, a.username]));
    const toRoll = (roll: typeof stats.best) => ({
      number: roll.number,
      score: roll.score,
      tier: table.tierOf(roll.score),
      playerName:
        players.get(roll.userId)?.name ?? usernames.get(roll.userId) ?? "?",
      avatar: players.get(roll.userId)?.avatar ?? null,
    });
    const tierLeaders = Object.fromEntries(
      TIERS.map((tier) => [
        tier,
        stats.tierLeaders[tier].map((id) => players.get(id)?.avatar ?? null),
      ])
    ) as Record<Tier, (Image | null)[]>;
    const { t } = context;

    return renderServerStats(
      {
        icon: await fetchImage(guild.iconURL({ extension: "png", size: 128 })),
        best: toRoll(stats.best),
        worst: toRoll(stats.worst),
        totalRolls: stats.totalRolls,
        averageScore: stats.averageScore,
        averageTier: table.tierOf(stats.averageScore),
        overallScore: stats.totalScore,
        tierCounts: stats.tierCounts,
        tierLeaders,
      },
      {
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
            value: formatExpected(context.locale, value),
          }),
      }
    );
  });
}
