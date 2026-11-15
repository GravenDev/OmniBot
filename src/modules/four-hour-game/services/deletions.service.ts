import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import channelHistoryService from "./channel-history.service.js";
import fourHourGameService from "./four-hour-game.service.js";

const logger = loggerMaker("four-hour-game");

class DeletionsService implements Service {
  // Shared by the single and bulk delete listeners: only deletions in the game
  // channel can change the message that currently holds.
  async handleGameDeletions(
    config: ConfigProvider<FourHourGameConfigSchema> | undefined,
    guildId: string,
    channelId: string,
    messageIds: readonly string[]
  ): Promise<void> {
    if (!config) {
      return;
    }
    const channel = config.get("channel");
    if (!channel?.isTextBased() || channel.id !== channelId) {
      return;
    }

    try {
      const replaced = await fourHourGameService.handleDeletion(
        guildId,
        channel.id,
        messageIds,
        () => channelHistoryService.fetchStandingMessage(channel)
      );
      if (replaced) {
        logger.info(
          `Holding message deleted, previous one put back in place | guildId = ${guildId} | channelId = ${channelId}`
        );
      }
    } catch (err) {
      logger.error(
        { err },
        `Failed to handle deleted game messages | guildId = ${guildId} | messageIds = ${messageIds.join(",")}`
      );
    }
  }
}

export default declareService(new DeletionsService());
