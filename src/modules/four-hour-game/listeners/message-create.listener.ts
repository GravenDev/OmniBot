import { EmbedBuilder, type Message } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { isPlayerMessage } from "#modules/four-hour-game/services/channel-history.js";
import fourHourGameService from "#modules/four-hour-game/services/four-hour-game.service.js";
import { Colors } from "#utils/colors.js";

const logger = loggerMaker("four-hour-game");

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

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(config.t("point.title"))
            .setDescription(
              config.t("point.description", {
                user: `<@${result.winnerId}>`,
                count: result.score,
              })
            )
            .setColor(Colors.FullGreen),
        ],
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      logger.error(
        { err },
        `Failed to process game message | guildId = ${message.guildId} | messageId = ${message.id}`
      );
    }
  },
});
