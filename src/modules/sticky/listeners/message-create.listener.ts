import type { Message } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import poster from "#modules/sticky/services/poster.js";
import store from "#modules/sticky/services/store.js";

export default declareEventListener<"messageCreate">({
  eventType: "messageCreate",

  async execute(message: Message, config) {
    if (!config || !message.inGuild()) {
      return;
    }

    const sticky = await store.get(message.guildId, message.channelId);
    if (!sticky) {
      return;
    }
    const isSticky =
      message.author.id === message.client.user.id &&
      !message.interactionMetadata &&
      message.content === sticky.content;
    if (!isSticky) {
      poster.bump(message.channel);
    }
  },
});
