import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { fetchStandingMessage } from "./channel-history.js";
import fourHourGameService from "./four-hour-game.service.js";

const logger = loggerMaker("four-hour-game");

// Shared by the single and bulk delete listeners: only deletions in the game
// channel can change the message that currently holds.
export async function handleGameDeletions(
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
    await fourHourGameService.handleDeletion(
      guildId,
      channel.id,
      messageIds,
      () => fetchStandingMessage(channel)
    );
  } catch (err) {
    logger.error(
      { err },
      `Failed to handle deleted game messages | guildId = ${guildId} | messageIds = ${messageIds.join(",")}`
    );
  }
}
