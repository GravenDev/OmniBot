import type { Image } from "@napi-rs/canvas";
import type { Client } from "discord.js";
import {
  decimalSeparator,
  formatInteger,
  formatPercentage,
} from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { fetchImage } from "#lib/imaging.js";
import { resolvePlayers } from "#lib/players.js";
import { renderStatCard } from "#lib/stat-card.js";
import { renderBoard } from "#modules/clash-of-code/rendering/board.js";
import { formatDuration } from "#modules/clash-of-code/rendering/format.js";
import { renderResult } from "#modules/clash-of-code/rendering/result.js";
import { ACCENT } from "#modules/clash-of-code/rendering/theme.js";
import { avatarUrl, type ClashMode, type ClashReport } from "./api.js";
import { playerStats, rankByWins, type Standing } from "./stats.js";
import store, { type StoredPlayer } from "./store.js";

export const PAGE_SIZE = 10;
export const RESULT_MAX_ROWS = 20;

export interface ViewContext {
  client: Client;
  guildId: string;
  t: TFunction;
  // The server's locale, for the thousands and decimal separators.
  locale: string;
}

export interface LeaderboardPage {
  image: Buffer;
  page: number;
  pageCount: number;
}

async function guildIcon(context: ViewContext): Promise<Image | null> {
  const guild =
    context.client.guilds.cache.get(context.guildId) ??
    (await context.client.guilds.fetch(context.guildId).catch(() => null));
  return fetchImage(guild?.iconURL({ extension: "png", size: 128 }) ?? null);
}

function codingameAvatar(avatarId: bigint | null): Promise<Image | null> {
  return fetchImage(avatarId === null ? null : avatarUrl(avatarId));
}

/** The CodinGame avatar, or the Discord one of a linked member who has none. */
async function playerAvatars(
  context: ViewContext,
  players: StoredPlayer[]
): Promise<Map<number, Image | null>> {
  const discordIds = players
    .filter((player) => player.avatarId === null && player.userId)
    .map((player) => player.userId!);
  const discord = await resolvePlayers(
    context.client,
    context.guildId,
    discordIds
  );
  const avatars = await Promise.all(
    players.map(async (player) => {
      const avatar =
        player.avatarId !== null
          ? await codingameAvatar(player.avatarId)
          : (discord.get(player.userId ?? "")?.avatar ?? null);
      return [player.codingamerId, avatar] as const;
    })
  );
  return new Map(avatars);
}

export function modeLabel(t: TFunction, mode: ClashMode | null): string {
  return mode ? t(`mode.${mode}`) : t("mode.unknown");
}

export async function resultImage(
  context: ViewContext,
  report: ClashReport
): Promise<Buffer> {
  const players = report.players.slice(0, RESULT_MAX_ROWS);
  const [icon, avatars] = await Promise.all([
    guildIcon(context),
    Promise.all(players.map((player) => codingameAvatar(player.avatarId))),
  ]);
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
      locale: context.locale,
      title: context.t("card.title"),
      subtitle: context.t("result.subtitle", {
        mode: modeLabel(context.t, report.mode),
        count: report.players.length,
      }),
      rank: context.t("table.rank"),
      player: context.t("table.player"),
      score: context.t("table.score"),
      time: context.t("table.time"),
      characters: context.t("table.characters"),
    }
  );
}

export async function leaderboardPage(
  context: ViewContext,
  mode: ClashMode | null,
  requestedPage: number,
  callerId: string
): Promise<LeaderboardPage | null> {
  const [standings, players, caller] = await Promise.all([
    store.participations(context.guildId, mode).then(rankByWins),
    store.players(context.guildId),
    store.playerByUser(context.guildId, callerId),
  ]);
  if (standings.length === 0) {
    return null;
  }

  const pageCount = Math.ceil(standings.length / PAGE_SIZE);
  const page = Math.min(Math.max(Math.trunc(requestedPage), 1), pageCount);
  const shown = standings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const callerStanding =
    caller && !shown.some((row) => row.codingamerId === caller.codingamerId)
      ? standings.find((row) => row.codingamerId === caller.codingamerId)
      : undefined;

  const byId = new Map(players.map((player) => [player.codingamerId, player]));
  const listed = [...shown, ...(callerStanding ? [callerStanding] : [])];
  const avatars = await playerAvatars(
    context,
    listed.flatMap((row) => byId.get(row.codingamerId) ?? [])
  );
  const toRow = (standing: Standing) => ({
    ...standing,
    name: byId.get(standing.codingamerId)?.nickname ?? "?",
    avatar: avatars.get(standing.codingamerId) ?? null,
  });

  const image = await renderBoard({
    icon: await guildIcon(context),
    title: context.t("card.title"),
    subtitle: context.t("leaderboard.subtitle", {
      mode: mode ? modeLabel(context.t, mode) : context.t("mode.all"),
    }),
    headers: {
      rank: context.t("table.rank"),
      player: context.t("table.player"),
    },
    // Wins and games, up to 4 digits under headers of about 80 px.
    nameWidth: 350,
    columns: [
      {
        header: context.t("table.wins"),
        right: 130,
        text: (row) => formatInteger(row.wins, context.locale),
        accent: true,
      },
      {
        header: context.t("table.games"),
        right: 0,
        text: (row) => formatInteger(row.games, context.locale),
      },
    ],
    rows: shown.map(toRow),
    extra: callerStanding && toRow(callerStanding),
  });
  return { image, page, pageCount };
}

export async function profileCard(
  context: ViewContext,
  player: StoredPlayer
): Promise<Buffer | null> {
  const participations = await store.participations(context.guildId);
  const stats = playerStats(
    participations.filter((row) => row.codingamerId === player.codingamerId)
  );
  if (!stats) {
    return null;
  }
  const everyone = rankByWins(participations);
  const standing = everyone.find(
    (row) => row.codingamerId === player.codingamerId
  );
  const avatar = (await playerAvatars(context, [player])).get(
    player.codingamerId
  );
  const { t, locale } = context;
  return renderStatCard({
    image: avatar ?? null,
    title: player.nickname,
    subtitle: player.userId
      ? t("profile.subtitleLinked")
      : t("profile.subtitle"),
    ...(standing && {
      rank: { position: standing.rank, total: everyone.length },
    }),
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
