import type { Message } from "discord.js";
import type { ConfigProvider } from "#lib/config.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import type { ThreadCreatorConfigSchema } from "#modules/thread-creator/thread-creator.config.js";
import { generateThreadName } from "#modules/thread-creator/thread-name.js";
import queue from "./thread-creation-queue.service.js";

const logger = loggerMaker("thread-creator");

class ThreadCreatorService implements Service {
  /**
   * Si le message est posté dans l'un des salons surveillés, planifie la
   * création d'un fil via la file d'attente (qui respecte le rate limit Discord
   * sans perdre de message).
   */
  scheduleThreadForMessage(
    message: Message,
    config: ConfigProvider<ThreadCreatorConfigSchema>
  ): void {
    if (!message.guild) {
      return;
    }

    const watchedChannels = config.get("channels");
    if (
      !watchedChannels ||
      !watchedChannels.some((channel) => channel.id === message.channel.id)
    ) {
      logger.debug(
        `Thread not scheduled | reason = channel not watched | guildId = ${message.guild.id} | channelId = ${message.channel.id}`
      );
      return;
    }

    queue.enqueue(message.guild.id, {
      message,
      threadName: generateThreadName(config.get("threadNameTemplate"), message),
      welcomeMessage: config.get("welcomeMessage"),
    });
  }
}

export default declareService(new ThreadCreatorService());
