import type { Message, PartialMessage } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { fetchLatestPlayerMessage } from "#modules/four-hour-game/services/channel-history.js";
import fourHourGameService from "#modules/four-hour-game/services/four-hour-game.service.js";

const logger = loggerMaker("four-hour-game");

export default declareEventListener<"messageDelete", FourHourGameConfigSchema>({
  eventType: "messageDelete",

  async execute(message: Message | PartialMessage, config) {
    if (!config || !message.guildId) {
      return;
    }

    const channel = config.get("channel");
    if (!channel?.isTextBased() || channel.id !== message.channelId) {
      return;
    }

    try {
      await fourHourGameService.handleDeletion(
        message.guildId,
        channel.id,
        [message.id],
        () => fetchLatestPlayerMessage(channel)
      );
    } catch (err) {
      logger.error(
        { err },
        `Failed to handle a deleted game message | guildId = ${message.guildId} | messageId = ${message.id}`
      );
    }
  },
});
