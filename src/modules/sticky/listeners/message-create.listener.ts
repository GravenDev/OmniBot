import type { Message } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import poster from "#modules/sticky/services/poster.js";
import store from "#modules/sticky/services/store.js";

export default declareEventListener<"messageCreate">({
  eventType: "messageCreate",

  async execute(message: Message, config) {
    if (
      !config ||
      !message.inGuild() ||
      message.author.id === message.client.user.id
    ) {
      return;
    }

    if (await store.get(message.guildId, message.channelId)) {
      poster.bump(message.channel);
    }
  },
});
