import type { Client } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { declareService, type Service } from "#lib/service.js";
import type { ClashMode, ClashReport } from "#modules/clash-of-code/api.js";
import {
  playerStats,
  rankByWins,
  type StoredPlayer,
} from "#modules/clash-of-code/stats.js";
import {
  leaderboardCard,
  profileStatCard,
  RESULT_MAX_ROWS,
  resultCard,
  standingsPage,
} from "#modules/clash-of-code/views.js";
import avatars from "./avatars.service.js";
import store from "./store.service.js";

export interface ViewContext {
  client: Client;
  guildId: string;
  t: TFunction;
  // The server's locale, for the thousands and decimal separators.
  locale: string;
}

interface LeaderboardPage {
  image: Buffer;
  page: number;
  pageCount: number;
}

/** The cards of the module, drawn from the database and the avatars. */
class ViewsService implements Service {
  async resultImage(
    context: ViewContext,
    report: ClashReport
  ): Promise<Buffer> {
    const players = report.players.slice(0, RESULT_MAX_ROWS);
    const [icon, images] = await Promise.all([
      avatars.guildIcon(context.client, context.guildId),
      Promise.all(
        players.map((player) => avatars.codingameAvatar(player.avatarId))
      ),
    ]);
    return resultCard(context.t, context.locale, report, icon, images);
  }

  async leaderboardPage(
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
    const found = standingsPage(
      standings,
      requestedPage,
      caller?.codingamerId ?? null
    );
    if (!found) {
      return null;
    }

    const byId = new Map(
      players.map((player) => [player.codingamerId, player])
    );
    const listed = [
      ...found.shown,
      ...(found.callerStanding ? [found.callerStanding] : []),
    ];
    const images = await avatars.playerAvatars(
      context.client,
      context.guildId,
      listed.flatMap((row) => byId.get(row.codingamerId) ?? [])
    );
    const image = await leaderboardCard(
      context.t,
      context.locale,
      mode,
      found,
      byId,
      images,
      await avatars.guildIcon(context.client, context.guildId)
    );
    return { image, page: found.page, pageCount: found.pageCount };
  }

  async profileCard(
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
    const avatar = (
      await avatars.playerAvatars(context.client, context.guildId, [player])
    ).get(player.codingamerId);
    return profileStatCard(
      context.t,
      context.locale,
      player,
      stats,
      standing ? { position: standing.rank, total: everyone.length } : null,
      avatar ?? null
    );
  }
}

export default declareService(new ViewsService());
