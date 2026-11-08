import type { DMChannel, NonThreadGuildBasedChannel } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import store from "#modules/autoreact/services/store.js";

const logger = loggerMaker("autoreact");

export default declareEventListener<"channelDelete">({
  eventType: "channelDelete",

  async execute(channel: DMChannel | NonThreadGuildBasedChannel, config) {
    if (!config || channel.isDMBased()) {
      return;
    }
    const removed = await store.remove(channel.guildId, channel.id);
    if (removed > 0) {
      logger.info(
        `Auto-reaction removed | reason = channel deleted | guildId = ${channel.guildId} | channelId = ${channel.id}`
      );
    }
  },
});
