import type { Message, PartialMessage } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import { handleGameDeletions } from "#modules/four-hour-game/services/deletions.js";

export default declareEventListener<"messageDelete", FourHourGameConfigSchema>({
  eventType: "messageDelete",

  async execute(message: Message | PartialMessage, config) {
    if (message.guildId) {
      await handleGameDeletions(config, message.guildId, message.channelId, [
        message.id,
      ]);
    }
  },
});
