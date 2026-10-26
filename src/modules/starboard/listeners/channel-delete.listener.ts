import type {
  AnyThreadChannel,
  DMChannel,
  NonThreadGuildBasedChannel,
} from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import starboard from "#modules/starboard/services/starboard.service.js";

export const channelDeleteListener = declareEventListener<"channelDelete">({
  eventType: "channelDelete",

  async execute(channel: DMChannel | NonThreadGuildBasedChannel, config) {
    if (!config || channel.isDMBased()) {
      return;
    }
    await starboard.handleChannelDeletion(
      channel.guildId,
      channel.id,
      channel.client
    );
  },
});

export const threadDeleteListener = declareEventListener<"threadDelete">({
  eventType: "threadDelete",

  async execute(thread: AnyThreadChannel, config) {
    if (!config) {
      return;
    }
    await starboard.handleChannelDeletion(
      thread.guildId,
      thread.id,
      thread.client
    );
  },
});
