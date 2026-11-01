import {
  AttachmentBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type Guild,
} from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { fetchImage } from "#lib/imaging.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { pageRow } from "#lib/pagination.js";
import { resolvePlayers } from "#lib/players.js";
import { RevisionCache } from "#lib/revision-cache.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import {
  renderLeaderboard,
  type LeaderboardRow,
} from "#modules/four-hour-game/rendering/leaderboard-image.js";
import fourHourGameService, {
  type LeaderboardEntry,
} from "#modules/four-hour-game/services/four-hour-game.service.js";

const CUSTOM_ID = "jd4h-leaderboard";
const PAGE_SIZE = 10;

const leaderboardCache = new RevisionCache(15_000);

type Config = ConfigProvider<FourHourGameConfigSchema>;
export type Board = "hold" | "daily";
// A public leaderboard is never paged in place: a button opens a copy only
// the member who pressed it sees, with their own row, paged from then on.
export type Visibility = "public" | "private";

export interface LeaderboardContext {
  client: Client;
  guildId: string;
  guild: Guild | null;
  config: Config;
}

interface Standings {
  entries: LeaderboardEntry[];
  page: number;
  pageCount: number;
  // The caller's own entry when they are ranked, on this page or not.
  caller: LeaderboardEntry | null;
}

const clampPage = (page: number, pageCount: number) =>
  Math.min(Math.max(1, Math.trunc(page)), pageCount);

async function standings(
  guildId: string,
  board: Board,
  requestedPage: number,
  callerId: string
): Promise<Standings> {
  if (board === "daily") {
    const all = await fourHourGameService.getDailyStandings(guildId);
    const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const page = clampPage(requestedPage, pageCount);
    return {
      entries: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      page,
      pageCount,
      caller: all.find((entry) => entry.userId === callerId) ?? null,
    };
  }
  const [total, rank, score] = await Promise.all([
    fourHourGameService.countPlayers(guildId),
    fourHourGameService.getRank(guildId, callerId),
    fourHourGameService.getScore(guildId, callerId),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = clampPage(requestedPage, pageCount);
  return {
    entries: await fourHourGameService.getLeaderboard(
      guildId,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE
    ),
    page,
    pageCount,
    caller: rank && score ? { userId: callerId, score, rank: rank.rank } : null,
  };
}

async function buildImage(
  context: LeaderboardContext,
  board: Board,
  { entries, caller }: Standings
): Promise<Buffer | null> {
  const { client, guildId, config } = context;
  // Like /rngdle leaderboard-all: highlighted on the page, or drawn under
  // the table when the caller is not among the shown entries.
  const callerOffPage =
    caller !== null && !entries.some((entry) => entry.userId === caller.userId);

  const players = await resolvePlayers(
    client,
    guildId,
    [...entries, ...(callerOffPage ? [caller] : [])].map(
      (entry) => entry.userId
    )
  );
  const toRow = (entry: LeaderboardEntry): LeaderboardRow[] => {
    const player = players.get(entry.userId);
    return player
      ? [
          {
            rank: entry.rank,
            name: player.name,
            score: entry.score,
            avatar: player.avatar,
          },
        ]
      : [];
  };
  const rows = entries.flatMap(toRow);
  const callerRow = callerOffPage ? toRow(caller)[0] : undefined;

  if (rows.length === 0) {
    return null;
  }

  const guild =
    context.guild ?? (await client.guilds.fetch(guildId).catch(() => null));
  const icon = await fetchImage(
    guild?.iconURL({ extension: "png", size: 128 }) ?? null
  );
  return renderLeaderboard(
    { icon, rows, callerRank: caller?.rank, caller: callerRow },
    {
      locale: config.locale,
      title: config.t("leaderboard.title"),
      subtitle: config.t(
        board === "daily"
          ? "leaderboard.daily.subtitle"
          : "leaderboard.subtitle"
      ),
      rank: config.t("leaderboard.header.rank"),
      player: config.t("leaderboard.header.player"),
      score: config.t("leaderboard.header.score"),
    }
  );
}

/** A page of the leaderboard, as the message that shows it. */
export async function leaderboardMessage(
  context: LeaderboardContext,
  board: Board,
  requestedPage: number,
  callerId: string,
  visibility: Visibility
) {
  const { guildId, config } = context;
  const shown = await standings(guildId, board, requestedPage, callerId);
  const image = await leaderboardCache.get(
    `${guildId}:${config.locale}:${board}:${shown.page}:${callerId}`,
    fourHourGameService.getRevision(guildId),
    () => buildImage(context, board, shown)
  );
  if (!image) {
    return {
      content: config.t(
        board === "daily" ? "leaderboard.daily.empty" : "leaderboard.empty"
      ),
      files: [],
      attachments: [],
      components: [],
    };
  }

  const id = (target: number | string) =>
    `${CUSTOM_ID}:${target}:${board}:${visibility}`;
  return {
    content: board === "daily" ? config.t("leaderboard.daily.title") : "",
    files: [new AttachmentBuilder(image, { name: "leaderboard.png" })],
    attachments: [],
    components:
      shown.pageCount > 1
        ? [
            pageRow(
              config.t,
              id,
              shown.page,
              shown.pageCount,
              "leaderboard.page"
            ),
          ]
        : [],
  };
}

export default declareInteractionHandler<
  ButtonInteraction,
  FourHourGameConfigSchema
>({
  customId: CUSTOM_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [rawPage, board, visibility], config) {
    const page = Number(rawPage);
    if (!interaction.inGuild() || !Number.isInteger(page)) {
      return;
    }

    if (visibility === "private") {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    await interaction.editReply(
      await leaderboardMessage(
        {
          client: interaction.client,
          guildId: interaction.guildId,
          guild: interaction.guild,
          config,
        },
        board === "daily" ? "daily" : "hold",
        page,
        interaction.user.id,
        "private"
      )
    );
  },
});
