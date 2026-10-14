import type { Message, TextBasedChannel } from "discord.js";
import { declareService, type Service } from "#lib/service.js";
import type { ChannelMessage } from "./four-hour-game.service.js";

const HISTORY_DEPTH = 50;

export class ChannelHistoryService implements Service {
  isPlayerMessage(message: Pick<Message, "author" | "system">): boolean {
    return !message.author.bot && !message.system;
  }

  async fetchLatestPlayerMessage(
    channel: TextBasedChannel
  ): Promise<ChannelMessage | null> {
    const messages = await channel.messages.fetch({ limit: HISTORY_DEPTH });
    const latest = [...messages.values()]
      .filter((message) => this.isPlayerMessage(message))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];

    return latest
      ? {
          messageId: latest.id,
          authorId: latest.author.id,
          sentAt: latest.createdAt,
        }
      : null;
  }
}

export default declareService(new ChannelHistoryService());
