import type { DMChannel, NonThreadGuildBasedChannel } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import store from "#modules/autoreact/services/store.js";

export default declareEventListener<"channelDelete">({
  eventType: "channelDelete",

  async execute(channel: DMChannel | NonThreadGuildBasedChannel, config) {
    if (!config || channel.isDMBased()) {
      return;
    }
    await store.remove(channel.guildId, channel.id);
  },
});
