import type {
  GuildTextBasedChannel,
  Message,
  PartialMessage,
  ReadonlyCollection,
  Snowflake,
} from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { fetchLatestPlayerMessage } from "#modules/four-hour-game/services/channel-history.js";
import fourHourGameService from "#modules/four-hour-game/services/four-hour-game.service.js";

const logger = loggerMaker("four-hour-game");

export default declareEventListener<
  "messageDeleteBulk",
  FourHourGameConfigSchema
>({
  eventType: "messageDeleteBulk",

  async execute(
    messages: ReadonlyCollection<Snowflake, Message | PartialMessage>,
    deletedFrom: GuildTextBasedChannel,
    config
  ) {
    if (!config) {
      return;
    }

    const channel = config.get("channel");
    if (!channel?.isTextBased() || channel.id !== deletedFrom.id) {
      return;
    }

    try {
      await fourHourGameService.handleDeletion(
        deletedFrom.guildId,
        channel.id,
        [...messages.keys()],
        () => fetchLatestPlayerMessage(channel)
      );
    } catch (err) {
      logger.error(
        { err },
        `Failed to handle deleted game messages | guildId = ${deletedFrom.guildId}`
      );
    }
  },
});
