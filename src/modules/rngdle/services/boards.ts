import type { Client, Guild, User } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { fetchAvatar, fetchImage } from "#lib/imaging.js";
import { renderDailyLeaderboard } from "#modules/rngdle/rendering/daily-leaderboard-image.js";
import {
  renderOverallLeaderboard,
  type OverallRow,
} from "#modules/rngdle/rendering/overall-leaderboard-image.js";
import { renderProfile } from "#modules/rngdle/rendering/profile-image.js";
import { renderServerStats } from "#modules/rngdle/rendering/server-stats-image.js";
import imageCache from "./image-cache.service.js";
import rngdleService, { type Account } from "./rngdle.service.js";
import { TIERS, type Tier } from "./score-table.js";
import scoreTableService from "./score-table.service.js";
import { computeRollStats, computeServerStats } from "./stats.js";

export const DAILY_LEADERBOARD_SIZE = 25;
export const OVERALL_PAGE_SIZE = 10;

export interface DailyLeaderboard {
  image: Buffer;
  winnerIds: string[];
}

export interface OverallPage {
  image: Buffer;
  page: number;
  pageCount: number;
}

function fetchUser(client: Client, userId: string): Promise<User | null> {
  return client.users.fetch(userId).catch(() => null);
}

export function utcDayRange(daysAgo: number, now = new Date()): [Date, Date] {
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo
    )
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start, end];
}

export async function buildDailyLeaderboard(
  client: Client,
  guildId: string,
  [from, to]: [Date, Date],
  t: TFunction
): Promise<DailyLeaderboard | null> {
  const rolls = (await rngdleService.rollsBetween(guildId, from, to)).slice(
    0,
    DAILY_LEADERBOARD_SIZE
  );
  const table = await scoreTableService.get();

  const rows = (
    await Promise.all(
      rolls.map(async (roll, index) => {
        const user = await fetchUser(client, roll.userId);
        if (!user) {
          return null;
        }
        return {
          rank: index + 1,
          name: user.username,
          avatar: await fetchAvatar(user),
          number: roll.number,
          score: roll.score,
          percent: table.percentOf(roll.score),
          tier: table.tierOf(roll.score),
        };
      })
    )
  ).filter((row) => row !== null);

  const [top] = rolls;
  if (!top || rows.length === 0) {
    return null;
  }

  const image = await renderDailyLeaderboard(rows, {
    rank: t("leaderboard.header.rank"),
    player: t("leaderboard.header.player"),
    number: t("leaderboard.header.number"),
    score: t("leaderboard.header.score"),
    placement: t("leaderboard.header.placement"),
  });
  const winnerIds = [
    ...new Set(
      rolls
        .filter((roll) => roll.score === top.score)
        .map((roll) => roll.userId)
    ),
  ];
  return { image, winnerIds };
}

export async function buildOverallPage(
  client: Client,
  guildId: string,
  requestedPage: number,
  callerId: string,
  t: TFunction,
  locale: string
): Promise<OverallPage | null> {
  const totals = await rngdleService.totalsByUser(guildId);
  if (totals.length === 0) {
    return null;
  }
  const accounts = new Map(
    (await rngdleService.listAccounts(guildId)).map((account) => [
      account.userId,
      account.username,
    ])
  );

  const pageCount = Math.ceil(totals.length / OVERALL_PAGE_SIZE);
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const start = (page - 1) * OVERALL_PAGE_SIZE;

  const toRow = async (index: number): Promise<OverallRow> => {
    const entry = totals[index]!;
    const user = await fetchUser(client, entry.userId);
    return {
      rank: index + 1,
      name: user?.username ?? accounts.get(entry.userId) ?? "?",
      avatar: user ? await fetchAvatar(user) : null,
      totalScore: entry.total,
    };
  };

  const indexes = totals
    .slice(start, start + OVERALL_PAGE_SIZE)
    .map((_, offset) => start + offset);
  const rows = await Promise.all(indexes.map(toRow));

  const callerIndex = totals.findIndex((entry) => entry.userId === callerId);
  const callerOnPage =
    callerIndex >= start && callerIndex < start + OVERALL_PAGE_SIZE;
  const caller =
    callerIndex >= 0 && !callerOnPage ? await toRow(callerIndex) : undefined;

  const image = await renderOverallLeaderboard(
    rows,
    {
      rank: t("leaderboard.header.rank"),
      player: t("leaderboard.header.player"),
      overallScore: t("overall.header.score"),
    },
    locale,
    caller
  );
  return { image, page, pageCount };
}

export function cachedOverallPage(
  client: Client,
  guildId: string,
  page: number,
  callerId: string,
  t: TFunction,
  locale: string
): Promise<OverallPage | null> {
  return imageCache.get(guildId, `overall:${locale}:${page}:${callerId}`, () =>
    buildOverallPage(client, guildId, page, callerId, t, locale)
  );
}

export async function buildProfile(
  account: Account,
  user: User,
  t: TFunction,
  locale: string
): Promise<Buffer | null> {
  const [rolls, totals, accounts, table] = await Promise.all([
    rngdleService.userRolls(account.guildId, account.userId),
    rngdleService.totalsByUser(account.guildId),
    rngdleService.listAccounts(account.guildId),
    scoreTableService.get(),
  ]);
  const stats = computeRollStats(rolls, table);
  if (!stats) {
    return null;
  }

  const formatDate = new Intl.DateTimeFormat(locale, {
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
      username: account.username,
      avatar: await fetchAvatar(user),
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
      tierCounts: stats.tierCounts,
    },
    {
      bestRoll: t("profile.bestRoll"),
      worstRoll: t("profile.worstRoll"),
      date: (date) => t("profile.date", { date }),
      totalRolls: t("profile.totalRolls"),
      averageScore: t("profile.averageScore"),
      maxBadges: t("profile.maxBadges"),
      maxBadgesValue: (count) => t("profile.maxBadgesValue", { count }),
      overallScore: t("profile.overallScore"),
      tierBreakdown: t("profile.tierBreakdown"),
    }
  );
}

export async function buildServerStats(
  client: Client,
  guild: Guild,
  t: TFunction
): Promise<Buffer | null> {
  const [rolls, accounts, table] = await Promise.all([
    rngdleService.guildRolls(guild.id),
    rngdleService.listAccounts(guild.id),
    scoreTableService.get(),
  ]);
  const stats = computeServerStats(rolls, table);
  if (!stats) {
    return null;
  }

  const usernames = new Map(
    accounts.map((account) => [account.userId, account.username])
  );
  const avatarOf = async (userId: string, size: 64 | 128) => {
    const user = await fetchUser(client, userId);
    return user ? fetchAvatar(user, size) : null;
  };
  const toRoll = async (roll: typeof stats.best) => ({
    number: roll.number,
    score: roll.score,
    tier: table.tierOf(roll.score),
    playerName: usernames.get(roll.userId) ?? "?",
    avatar: await avatarOf(roll.userId, 64),
  });

  const leaderAvatars = await Promise.all(
    TIERS.map(
      async (tier) =>
        [
          tier,
          await Promise.all(
            stats.tierLeaders[tier].map((userId) => avatarOf(userId, 64))
          ),
        ] as const
    )
  );

  return renderServerStats(
    {
      icon: await fetchImage(guild.iconURL({ extension: "png", size: 128 })),
      best: await toRoll(stats.best),
      worst: await toRoll(stats.worst),
      totalRolls: stats.totalRolls,
      averageScore: stats.averageScore,
      averageTier: table.tierOf(stats.averageScore),
      overallScore: stats.totalScore,
      tierCounts: stats.tierCounts,
      tierLeaders: Object.fromEntries(leaderAvatars) as Record<
        Tier,
        Awaited<ReturnType<typeof avatarOf>>[]
      >,
    },
    {
      title: t("server.title"),
      bestRoll: t("server.bestRoll"),
      worstRoll: t("server.worstRoll"),
      by: (name) => t("server.by", { name }),
      totalRolls: t("server.totalRolls"),
      averageScore: t("server.averageScore"),
      overallScore: t("server.overallScore"),
      tierBreakdown: t("server.tierBreakdown"),
    }
  );
}
