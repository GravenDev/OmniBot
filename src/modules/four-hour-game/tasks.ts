import { EmbedBuilder, type Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareTask } from "#lib/task.js";
import { Colors } from "#utils/colors.js";
import type { FourHourGameConfigSchema } from "./four-hour-game.config.js";
import { GAME_TIME_ZONE } from "./services/daily.js";
import { formatHeldTime, formatRank } from "./services/formatting.js";
import fourHourGameService, {
  type DailyPoint,
  type PlayerRank,
} from "./services/four-hour-game.service.js";
import { fetchWinnerAvatar } from "./services/winner-avatar.js";

const logger = loggerMaker("four-hour-game");

export interface DailyPointAnnouncement extends DailyPoint {
  total: number;
  rank: PlayerRank | null;
  avatarUrl: string | null;
}

export function buildDailyPointEmbed(
  announcement: DailyPointAnnouncement,
  config: ConfigProvider<FourHourGameConfigSchema>
): EmbedBuilder {
  const date = new Intl.DateTimeFormat(config.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${announcement.day}T00:00:00Z`));
  const headline = config.t("daily.description", {
    user: `<@${announcement.userId}>`,
    date,
    duration: formatHeldTime(announcement.heldSeconds, config.t),
  });
  const total = config.t("daily.total", { count: announcement.total });
  const summary = announcement.rank
    ? `${total} · ${formatRank(announcement.rank, config.t)}`
    : total;

  const embed = new EmbedBuilder()
    .setTitle(config.t("daily.title"))
    .setDescription(`${headline}\n${summary}`)
    .setColor(Colors.FullGreen);

  if (announcement.avatarUrl) {
    embed.setThumbnail(announcement.avatarUrl);
  }
  return embed;
}

async function closeDays(
  client: Client,
  module: Module<FourHourGameConfigSchema>,
  guildId: string
): Promise<void> {
  const config = await configService.getConfigForModuleIn(module, guildId);
  const channel = config.get("channel");
  const points = await fourHourGameService.closeDays(
    guildId,
    channel?.id ?? null
  );
  if (points.length === 0 || !channel?.isSendable()) {
    return;
  }

  const guild = await client.guilds.fetch(guildId);
  for (const point of points) {
    try {
      const standings = await fourHourGameService.getDailyStandings(
        guildId,
        point.day
      );
      const entry = standings.find((row) => row.userId === point.userId);
      await channel.send({
        embeds: [
          buildDailyPointEmbed(
            {
              ...point,
              total: entry?.score ?? 0,
              rank: entry
                ? { rank: entry.rank, total: standings.length }
                : null,
              avatarUrl: await fetchWinnerAvatar(guild, point.userId),
            },
            config
          ),
        ],
        allowedMentions: { parse: [] },
      });
      logger.info(
        `Daily point announced | guildId = ${guildId} | day = ${point.day} | userId = ${point.userId}`
      );
    } catch (err) {
      logger.error(
        { err },
        `Failed to announce the daily point | guildId = ${guildId} | day = ${point.day}`
      );
    }
  }
}

export async function closeAllDays(
  client: Client,
  module: Module<FourHourGameConfigSchema>
): Promise<void> {
  for (const guildId of await moduleService.getActivatedGuildIds(module.id)) {
    await closeDays(client, module, guildId).catch((err: unknown) =>
      logger.error({ err }, `Failed to close the day | guildId = ${guildId}`)
    );
  }
}

export function fourHourGameTasks(module: Module<FourHourGameConfigSchema>) {
  return [
    declareTask({
      id: "daily-point",
      schedule: "0 0 * * *",
      timezone: GAME_TIME_ZONE,
      run: (client) => closeAllDays(client, module),
    }),
  ];
}
