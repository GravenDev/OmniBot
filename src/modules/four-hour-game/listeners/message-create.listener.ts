import type { EmbedBuilder, Message } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import {
  ANNOUNCEMENT_OPTIONS,
  buildAnnouncementEmbed,
} from "#modules/four-hour-game/rendering/announcement.js";
import { isPlayerMessage } from "#modules/four-hour-game/services/channel-history.js";
import { formatHeldTime } from "#modules/four-hour-game/services/formatting.js";
import fourHourGameService, {
  type PlayerRank,
} from "#modules/four-hour-game/services/four-hour-game.service.js";
import { fetchWinnerAvatar } from "#modules/four-hour-game/services/winner-avatar.js";

const logger = loggerMaker("four-hour-game");

export interface PointAnnouncement {
  winnerId: string;
  score: number;
  heldSeconds: number;
  heldSince: Date;
  rank: PlayerRank | null;
  avatarUrl: string | null;
}

export function buildPointEmbed(
  announcement: PointAnnouncement,
  config: ConfigProvider<FourHourGameConfigSchema>
): EmbedBuilder {
  return buildAnnouncementEmbed(
    {
      title: config.t("point.title"),
      headline: config.t("point.description", {
        user: `<@${announcement.winnerId}>`,
        duration: formatHeldTime(announcement.heldSeconds, config.t),
      }),
      total: config.t("point.total", { count: announcement.score }),
      rank: announcement.rank,
      avatarUrl: announcement.avatarUrl,
    },
    config.t
  )
    .setFooter({ text: config.t("point.postedAt") })
    .setTimestamp(announcement.heldSince);
}

async function fetchRank(
  guildId: string,
  userId: string
): Promise<PlayerRank | null> {
  try {
    return await fourHourGameService.getRank(guildId, userId);
  } catch (err) {
    logger.warn(
      { err },
      `Failed to compute rank | guildId = ${guildId} | userId = ${userId}`
    );
    return null;
  }
}

export default declareEventListener<"messageCreate", FourHourGameConfigSchema>({
  eventType: "messageCreate",

  async execute(message: Message, config) {
    if (!config || !isPlayerMessage(message) || !message.inGuild()) {
      return;
    }

    const channel = config.get("channel");
    const delay = config.get("delay");
    if (!channel || channel.id !== message.channelId || !(delay > 0)) {
      return;
    }

    try {
      const result = await fourHourGameService.handleMessage(
        {
          guildId: message.guildId,
          channelId: message.channelId,
          messageId: message.id,
          authorId: message.author.id,
          sentAt: message.createdAt,
        },
        delay
      );

      if (result.kind !== "point") {
        return;
      }

      logger.info(
        `Point awarded | guildId = ${message.guildId} | userId = ${result.winnerId} | score = ${result.score}`
      );

      const [rank, avatarUrl] = await Promise.all([
        fetchRank(message.guildId, result.winnerId),
        fetchWinnerAvatar(message.guild, result.winnerId),
      ]);

      await message.channel.send({
        embeds: [
          buildPointEmbed(
            {
              winnerId: result.winnerId,
              score: result.score,
              heldSeconds: result.heldSeconds,
              heldSince: result.heldSince,
              rank,
              avatarUrl,
            },
            config
          ),
        ],
        ...ANNOUNCEMENT_OPTIONS,
      });
    } catch (err) {
      logger.error(
        { err },
        `Failed to process game message | guildId = ${message.guildId} | messageId = ${message.id}`
      );
    }
  },
});
