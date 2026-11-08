import type { DMChannel, NonThreadGuildBasedChannel } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import store from "#modules/sticky/services/store.js";

const logger = loggerMaker("sticky");

export default declareEventListener<"channelDelete">({
  eventType: "channelDelete",

  async execute(channel: DMChannel | NonThreadGuildBasedChannel, config) {
    if (!config || channel.isDMBased()) {
      return;
    }
    const removed = await store.remove(channel.guildId, channel.id);
    if (removed > 0) {
      logger.info(
        `Sticky removed | reason = channel deleted | guildId = ${channel.guildId} | channelId = ${channel.id}`
      );
    }
  },
});
