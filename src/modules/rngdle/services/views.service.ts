import type { Image } from "@napi-rs/canvas";
import type { Client, Guild } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { fetchImage } from "#lib/imaging.js";
import { resolvePlayers } from "#lib/players.js";
import { RevisionCache } from "#lib/revision-cache.js";
import { declareService, type Service } from "#lib/service.js";
import {
  renderProfile,
  renderServerStats,
} from "#modules/rngdle/rendering/cards.js";
import {
  formatExpected,
  formatSpaced,
} from "#modules/rngdle/rendering/format.js";
import {
  renderDailyLeaderboard,
  renderOverallLeaderboard,
} from "#modules/rngdle/rendering/leaderboards.js";
import {
  renderVersus,
  type VersusPlayer,
} from "#modules/rngdle/rendering/versus.js";
import recap, { type DailyRecap } from "./recap.service.js";
import { TIERS, type Tier } from "./scoring.service.js";
import stats from "./stats.service.js";
import store, { type Account, type DateRange } from "./store.service.js";
import versus, { type VersusSide } from "./versus.service.js";

const DAILY_SIZE = 25;
const OVERALL_PAGE_SIZE = 10;
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

export interface DailyLeaderboard {
  image: Buffer;
  winnerIds: string[];
}

export interface OverallPage {
  image: Buffer;
  page: number;
  pageCount: number;
}

export class ViewsService implements Service {
  parsePeriod(value: string | null | undefined): Period {
    return PERIODS.find((period) => period === value) ?? "all";
  }

  private cached<T>(context: ViewContext, key: string, load: () => Promise<T>) {
    return cache.get(
      `${context.guildId}:${context.locale}:${key}`,
      store.revision(context.guildId),
      load
    );
  }

  utcDayRange(daysAgo: number, now = new Date()): [Date, Date] {
    const start = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo
    );
    return [new Date(start), new Date(start + DAY_MS)];
  }

  periodRange(period: Period, now = new Date()): DateRange {
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

  dailyLeaderboard(
    context: ViewContext,
    daysAgo: number
  ): Promise<DailyLeaderboard | null> {
    const [from, to] = this.utcDayRange(daysAgo);
    return this.cached(context, `daily:${from.toISOString()}`, async () => {
      const [rolls, table, accounts] = await Promise.all([
        store.rolls(context.guildId, { from, to, byScore: true }),
        store.scoreTable(),
        store.accounts(context.guildId),
      ]);
      const top = rolls.slice(0, DAILY_SIZE);
      const usernames = new Map(accounts.map((a) => [a.userId, a.username]));
      const players = await resolvePlayers(
        context.client,
        context.guildId,
        top.map((roll) => roll.userId)
      );
      const rows = top.map((roll, index) => {
        const player = players.get(roll.userId);
        return {
          rank: index + 1,
          name: player?.name ?? usernames.get(roll.userId) ?? "?",
          avatar: player?.avatar ?? null,
          number: roll.number,
          score: roll.score,
          percent: table.percentOf(roll.score),
          tier: table.tierOf(roll.score),
        };
      });
      const best = top[0]?.score;
      if (best === undefined) {
        return null;
      }

      const { t } = context;
      return {
        image: await renderDailyLeaderboard(rows, {
          rank: t("leaderboard.header.rank"),
          player: t("leaderboard.header.player"),
          number: t("leaderboard.header.number"),
          score: t("leaderboard.header.score"),
          placement: t("leaderboard.header.placement"),
        }),
        winnerIds: [
          ...new Set(
            top.filter((roll) => roll.score === best).map((roll) => roll.userId)
          ),
        ],
      };
    });
  }

  async dailyRecap(
    guildId: string,
    daysAgo: number
  ): Promise<DailyRecap | null> {
    const [from, to] = this.utcDayRange(daysAgo);
    const [history, table] = await Promise.all([
      store.rolls(guildId, { to }),
      store.scoreTable(),
    ]);
    return recap.computeDailyRecap(history, from, table);
  }

  overallPage(
    context: ViewContext,
    requestedPage: number,
    callerId: string,
    period: Period = "all",
    now: Date = new Date()
  ): Promise<OverallPage | null> {
    const range = this.periodRange(period, now);
    const key = `overall:${period}:${range.from?.toISOString() ?? ""}:${requestedPage}:${callerId}`;
    return this.cached(context, key, async () => {
      const [totals, accounts] = await Promise.all([
        store.totals(context.guildId, range),
        store.accounts(context.guildId),
      ]);
      if (totals.length === 0) {
        return null;
      }

      const pageCount = Math.ceil(totals.length / OVERALL_PAGE_SIZE);
      const page = Math.min(Math.max(requestedPage, 1), pageCount);
      const start = (page - 1) * OVERALL_PAGE_SIZE;
      const callerIndex = totals.findIndex(
        (entry) => entry.userId === callerId
      );
      const indexes = totals
        .slice(start, start + OVERALL_PAGE_SIZE)
        .map((_, offset) => start + offset);
      const callerOffPage =
        callerIndex >= 0 &&
        (callerIndex < start || callerIndex >= start + OVERALL_PAGE_SIZE);

      const usernames = new Map(accounts.map((a) => [a.userId, a.username]));
      const shown = callerOffPage ? [...indexes, callerIndex] : indexes;
      const players = await resolvePlayers(
        context.client,
        context.guildId,
        shown.map((index) => totals[index]!.userId)
      );
      const toRow = (index: number) => {
        const { userId, total } = totals[index]!;
        const player = players.get(userId);
        return {
          rank: index + 1,
          name: player?.name ?? usernames.get(userId) ?? "?",
          avatar: player?.avatar ?? null,
          totalScore: total,
        };
      };

      const image = await renderOverallLeaderboard(
        indexes.map(toRow),
        {
          rank: context.t("leaderboard.header.rank"),
          player: context.t("leaderboard.header.player"),
          overallScore: context.t("overall.header.score"),
        },
        context.locale,
        callerOffPage ? toRow(callerIndex) : undefined
      );
      return { image, page, pageCount };
    });
  }

  profileCard(context: ViewContext, account: Account): Promise<Buffer | null> {
    return this.cached(context, `profile:${account.userId}`, async () => {
      const [rolls, totals, accounts, table] = await Promise.all([
        store.rolls(account.guildId, { userId: account.userId }),
        store.totals(account.guildId),
        store.accounts(account.guildId),
        store.scoreTable(),
      ]);
      const rollStats = stats.computeRollStats(rolls, table);
      if (!rollStats) {
        return null;
      }
      const streaks = stats.computeStreaks(rolls, new Date());

      const player = (
        await resolvePlayers(context.client, context.guildId, [account.userId])
      ).get(account.userId);
      const formatDate = new Intl.DateTimeFormat(context.locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
      const toRoll = (roll: typeof rollStats.best) => ({
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
            totals.findIndex((entry) => entry.userId === account.userId) + 1,
          totalPlayers: accounts.length,
          best: toRoll(rollStats.best),
          worst: toRoll(rollStats.worst),
          totalRolls: rollStats.totalRolls,
          averageScore: rollStats.averageScore,
          averageTier: table.tierOf(rollStats.averageScore),
          maxBadges: rollStats.maxBadges,
          totalScore: rollStats.totalScore,
          currentStreak: streaks.current,
          bestStreak: streaks.best,
          tierCounts: rollStats.tierCounts,
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
        const match = versus.computeVersus(leftRolls, rightRolls);
        if (!match) {
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
            left: toPlayer(left, match.left),
            right: toPlayer(right, match.right),
            headToHead: match.headToHead,
            winners: match.winners,
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
      const serverStats = stats.computeServerStats(rolls, table);
      if (!serverStats) {
        return null;
      }

      const players = await resolvePlayers(context.client, context.guildId, [
        serverStats.best.userId,
        serverStats.worst.userId,
        ...TIERS.flatMap((tier) => serverStats.tierLeaders[tier]),
      ]);
      const usernames = new Map(accounts.map((a) => [a.userId, a.username]));
      const toRoll = (roll: typeof serverStats.best) => ({
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
          serverStats.tierLeaders[tier].map(
            (id) => players.get(id)?.avatar ?? null
          ),
        ])
      ) as Record<Tier, (Image | null)[]>;
      const { t } = context;

      return renderServerStats(
        {
          icon: await fetchImage(
            guild.iconURL({ extension: "png", size: 128 })
          ),
          best: toRoll(serverStats.best),
          worst: toRoll(serverStats.worst),
          totalRolls: serverStats.totalRolls,
          averageScore: serverStats.averageScore,
          averageTier: table.tierOf(serverStats.averageScore),
          overallScore: serverStats.totalScore,
          tierCounts: serverStats.tierCounts,
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
}

export default declareService(new ViewsService());
