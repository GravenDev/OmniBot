import type { Image } from "@napi-rs/canvas";
import type { Client, Guild } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { fetchImage } from "#lib/imaging.js";
import { resolvePlayers } from "#lib/players.js";
import { RevisionCache } from "#lib/revision-cache.js";
import { declareService, type Service } from "#lib/service.js";
import { DAY_MS, utcDayNumber } from "#modules/rngdle/days.js";
import {
  monthsBetween,
  nextMonth,
  periodRange,
  periodText,
  utcDayRange,
  type Period,
} from "#modules/rngdle/periods.js";
import { computeDailyRecap, type DailyRecap } from "#modules/rngdle/recap.js";
import {
  renderProfile,
  renderServerStats,
} from "#modules/rngdle/rendering/cards.js";
import { renderHistory } from "#modules/rngdle/rendering/history.js";
import {
  dailyLeaderboardLabels,
  historyLabels,
  overallLeaderboardLabels,
  profileLabels,
  serverStatsLabels,
  timelineLabels,
  trendLabels,
  versusLabels,
} from "#modules/rngdle/rendering/labels.js";
import {
  renderDailyLeaderboard,
  renderOverallLeaderboard,
} from "#modules/rngdle/rendering/leaderboards.js";
import {
  renderTimeline,
  TIMELINE_TIERS,
  type TimelineTier,
} from "#modules/rngdle/rendering/timeline.js";
import { renderTrend } from "#modules/rngdle/rendering/trend.js";
import {
  renderVersus,
  type VersusPlayer,
} from "#modules/rngdle/rendering/versus.js";
import { TIERS, type Tier } from "#modules/rngdle/scoring/score-table.js";
import {
  byBestRoll,
  computeRanking,
  computeRollStats,
  computeServerStats,
  computeStreaks,
} from "#modules/rngdle/scoring/stats.js";
import {
  computeVersus,
  type VersusSide,
} from "#modules/rngdle/scoring/versus.js";
import store, { type Account, type StoredRoll } from "./store.service.js";

const DAILY_SIZE = 25;
const OVERALL_PAGE_SIZE = 10;
export const HISTORY_SIZE = 10;
export const HISTORY_MIN = 5;
export const HISTORY_MAX = 15;
export const TREND_DAYS = [30, 90, 365] as const;
export const TREND_DEFAULT_DAYS = 90;
const TREND_MIN_PREVIOUS = 5;
const CACHE_TTL_MS = 15_000;

export interface ViewContext {
  client: Client;
  guildId: string;
  t: TFunction;
  locale: string;
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

export type HistoryPage = OverallPage;

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

class RngdleViews implements Service {
  private readonly cache = new RevisionCache(CACHE_TTL_MS);

  private cached<T>(context: ViewContext, key: string, load: () => Promise<T>) {
    return this.cache.get(
      `${context.guildId}:${context.locale}:${key}`,
      store.revision(context.guildId),
      load
    );
  }

  dailyLeaderboard(
    context: ViewContext,
    daysAgo: number
  ): Promise<DailyLeaderboard | null> {
    const [from, to] = utcDayRange(daysAgo);
    const [previousFrom] = utcDayRange(daysAgo + 1);
    return this.cached(context, `daily:${from.toISOString()}`, async () => {
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

      return {
        image: await renderDailyLeaderboard(
          {
            icon,
            subtitle: context.t("leaderboard.subtitle", {
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
              previous:
                hadPrevious && daysAgo > 0
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
          dailyLeaderboardLabels(context.t, context.locale)
        ),
        winnerIds: [
          ...new Set(
            rolls
              .filter((roll) => roll.score === best)
              .map((roll) => roll.userId)
          ),
        ],
      };
    });
  }

  async dailyRecap(
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

  overallPage(
    context: ViewContext,
    requestedPage: number,
    callerId: string,
    period: Period = "all",
    now: Date = new Date()
  ): Promise<OverallPage | null> {
    const range = periodRange(period, now);
    const key = `overall:${period}:${range.from?.toISOString() ?? ""}:${requestedPage}:${callerId}`;
    return this.cached(context, key, async () => {
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
      const callerIndex = ranking.findIndex(
        (entry) => entry.userId === callerId
      );
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

      const image = await renderOverallLeaderboard(
        {
          icon,
          subtitle: periodText(context, period, now, "overall.subtitle"),
          players: ranking.length,
          rolls: rolls.length,
          average: { score: average, tier: table.tierOf(average) },
          ranking: shownRanking.map((_, offset) =>
            toRankingRow(start + offset)
          ),
          caller: callerOffPage ? toRankingRow(callerIndex) : undefined,
          bestRolls: shownBest.map((entry, offset) => ({
            ...player(entry.userId, start + offset + 1),
            number: entry.best.number,
            score: entry.best.score,
            tier: table.tierOf(entry.best.score),
          })),
        },
        overallLeaderboardLabels(context.t, context.locale)
      );
      return { image, page, pageCount };
    });
  }

  profileCard(context: ViewContext, account: Account): Promise<Buffer | null> {
    return this.cached(context, `profile:${account.userId}`, async () => {
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
        profileLabels(context.t, context.locale)
      );
    });
  }

  historyCard(
    context: ViewContext,
    account: Account,
    count: number = HISTORY_SIZE,
    now: Date = new Date(),
    requestedPage = 1
  ): Promise<HistoryPage | null> {
    const size = Math.min(Math.max(count, HISTORY_MIN), HISTORY_MAX);
    const today = utcDayNumber(now);
    const key = `history:${account.userId}:${size}:${today}:${requestedPage}`;
    return this.cached(context, key, async () => {
      const [rolls, table] = await Promise.all([
        store.rolls(account.guildId, {
          userId: account.userId,
          to: utcDayRange(0, now)[1],
        }),
        store.scoreTable(),
      ]);
      if (rolls.length === 0) {
        return null;
      }
      const pageCount = Math.ceil(rolls.length / size);
      const page = Math.min(Math.max(requestedPage, 1), pageCount);
      const end = rolls.length - (page - 1) * size;
      const recent = rolls.slice(Math.max(0, end - size), end).reverse();

      const player = (
        await resolvePlayers(context.client, context.guildId, [account.userId])
      ).get(account.userId);
      const dateFormat = {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      } as const;
      const formatDate = new Intl.DateTimeFormat(context.locale, dateFormat);
      const formatOldDate = new Intl.DateTimeFormat(context.locale, {
        ...dateFormat,
        year: "numeric",
      });
      const currentYear = now.getUTCFullYear();
      const rows = recent.map((roll) => {
        const isToday = utcDayNumber(roll.rolledAt) === today;
        const format =
          roll.rolledAt.getUTCFullYear() === currentYear
            ? formatDate
            : formatOldDate;
        return {
          dateText: isToday
            ? context.t("history.today")
            : format.format(roll.rolledAt),
          today: isToday,
          number: roll.number,
          score: roll.score,
          percent: table.percentOf(roll.score),
          tier: table.tierOf(roll.score),
        };
      });
      const average = averageScore(recent);
      const streaks = computeStreaks(rolls, now);

      const image = await renderHistory(
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
        historyLabels(context.t, context.locale, {
          page,
          size,
          total: rolls.length,
        })
      );
      return { image, page, pageCount };
    });
  }

  timelineCard(
    context: ViewContext,
    account: Account,
    now: Date = new Date()
  ): Promise<Buffer | null> {
    const key = `timeline:${account.userId}:${utcDayNumber(now)}`;
    return this.cached(context, key, async () => {
      const [rolls, table] = await Promise.all([
        store.rolls(account.guildId, {
          userId: account.userId,
          to: utcDayRange(0, now)[1],
        }),
        store.scoreTable(),
      ]);
      const firstRoll = rolls[0]?.rolledAt;
      if (!firstRoll) {
        return null;
      }

      const player = (
        await resolvePlayers(context.client, context.guildId, [account.userId])
      ).get(account.userId);
      const from = new Date(
        Date.UTC(firstRoll.getUTCFullYear(), firstRoll.getUTCMonth(), 1)
      );
      const to = nextMonth(now);
      const formatDate = new Intl.DateTimeFormat(context.locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
      const pins = rolls.flatMap((roll) => {
        const tier = table.tierOf(roll.score);
        return TIMELINE_TIERS.some((shown) => shown === tier)
          ? [
              {
                at: roll.rolledAt,
                tier: tier as TimelineTier,
                score: roll.score,
                dateText: formatDate.format(roll.rolledAt),
              },
            ]
          : [];
      });

      return renderTimeline(
        {
          username: player?.name ?? account.username,
          avatar: player?.avatar ?? null,
          from,
          to,
          firstRoll,
          now,
          months: monthsBetween(context.locale, from, to),
          pins,
          totalRolls: rolls.length,
        },
        timelineLabels(context.t, context.locale, {
          count: rolls.length,
          firstRoll,
        })
      );
    });
  }

  trendCard(
    context: ViewContext,
    account: Account,
    days: number = TREND_DEFAULT_DAYS,
    now: Date = new Date()
  ): Promise<Buffer | null> {
    const key = `trend:${account.userId}:${days}:${utcDayNumber(now)}`;
    return this.cached(context, key, async () => {
      const from = utcDayRange(days - 1, now)[0];
      const to = utcDayRange(0, now)[1];
      const [rolls, table] = await Promise.all([
        store.rolls(account.guildId, {
          userId: account.userId,
          from: new Date(from.getTime() - days * DAY_MS),
          to,
        }),
        store.scoreTable(),
      ]);
      const period = rolls.filter((roll) => roll.rolledAt >= from);
      const previous = rolls.filter((roll) => roll.rolledAt < from);
      const stats = computeRollStats(period, table);
      if (!stats) {
        return null;
      }

      const player = (
        await resolvePlayers(context.client, context.guildId, [account.userId])
      ).get(account.userId);
      const formatDate = new Intl.DateTimeFormat(context.locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
      const toRoll = (roll: typeof stats.best) => ({
        number: roll.number,
        score: roll.score,
        tier: table.tierOf(roll.score),
        dateText: formatDate.format(roll.rolledAt),
      });
      const trendRolls = period.map((roll) => ({
        rolledAt: roll.rolledAt,
        percent: table.percentOf(roll.score),
        tier: table.tierOf(roll.score),
      }));

      return renderTrend(
        {
          username: player?.name ?? account.username,
          avatar: player?.avatar ?? null,
          from,
          days,
          months: monthsBetween(context.locale, from, to),
          rolls: trendRolls,
          best: toRoll(stats.best),
          worst: toRoll(stats.worst),
          averageScore: stats.averageScore,
          averageTier: table.tierOf(stats.averageScore),
          averagePercent:
            trendRolls.reduce((sum, roll) => sum + roll.percent, 0) /
            trendRolls.length,
          upperHalf: trendRolls.filter((roll) => roll.percent > 50).length,
          change:
            previous.length >= TREND_MIN_PREVIOUS
              ? (stats.averageScore / averageScore(previous) - 1) * 100
              : null,
          tierCounts: stats.tierCounts,
        },
        trendLabels(context.t, context.locale, { days, from, now })
      );
    });
  }

  versusCard(
    context: ViewContext,
    left: Account,
    right: Account
  ): Promise<Buffer | null> {
    return this.cached(
      context,
      `versus:${left.userId}:${right.userId}`,
      async () => {
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

        return renderVersus(
          {
            left: toPlayer(left, versus.left),
            right: toPlayer(right, versus.right),
            headToHead: versus.headToHead,
            winners: versus.winners,
          },
          versusLabels(context.t, context.locale)
        );
      }
    );
  }

  serverCard(context: ViewContext, guild: Guild): Promise<Buffer | null> {
    return this.cached(context, "server", async () => {
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

      return renderServerStats(
        {
          icon: await fetchImage(
            guild.iconURL({ extension: "png", size: 128 })
          ),
          best: toRoll(stats.best),
          worst: toRoll(stats.worst),
          totalRolls: stats.totalRolls,
          averageScore: stats.averageScore,
          averageTier: table.tierOf(stats.averageScore),
          overallScore: stats.totalScore,
          tierCounts: stats.tierCounts,
          tierLeaders,
        },
        serverStatsLabels(context.t, context.locale)
      );
    });
  }
}

export default declareService(new RngdleViews());
