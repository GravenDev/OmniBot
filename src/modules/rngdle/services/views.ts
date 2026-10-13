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
import {
  renderDailyLeaderboard,
  renderOverallLeaderboard,
} from "#modules/rngdle/rendering/leaderboards.js";
import { computeDailyRecap, type DailyRecap } from "./recap.js";
import { TIERS, type Tier } from "./scoring.js";
import {
  computeRollStats,
  computeServerStats,
  computeStreaks,
} from "./stats.js";
import store, { type Account } from "./store.js";

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

export function dailyLeaderboard(
  context: ViewContext,
  daysAgo: number
): Promise<DailyLeaderboard | null> {
  const [from, to] = utcDayRange(daysAgo);
  return cached(context, `daily:${from.toISOString()}`, async () => {
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
  callerId: string
): Promise<OverallPage | null> {
  return cached(context, `overall:${requestedPage}:${callerId}`, async () => {
    const [totals, accounts] = await Promise.all([
      store.totals(context.guildId),
      store.accounts(context.guildId),
    ]);
    if (totals.length === 0) {
      return null;
    }

    const pageCount = Math.ceil(totals.length / OVERALL_PAGE_SIZE);
    const page = Math.min(Math.max(requestedPage, 1), pageCount);
    const start = (page - 1) * OVERALL_PAGE_SIZE;
    const callerIndex = totals.findIndex((entry) => entry.userId === callerId);
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

export function profileCard(
  context: ViewContext,
  account: Account
): Promise<Buffer | null> {
  return cached(context, `profile:${account.userId}`, async () => {
    const [rolls, totals, accounts, table] = await Promise.all([
      store.rolls(account.guildId, { userId: account.userId }),
      store.totals(account.guildId),
      store.accounts(account.guildId),
      store.scoreTable(),
    ]);
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
          totals.findIndex((entry) => entry.userId === account.userId) + 1,
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
