import { ChannelType, type Message } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import logger from "#lib/logger.js";
import threadCreatorService from "#modules/thread-creator/services/thread-creator.service.js";
import type { ThreadCreatorConfigSchema } from "#modules/thread-creator/thread-creator.config.js";

export default declareEventListener<"messageCreate", ThreadCreatorConfigSchema>(
  {
    eventType: "messageCreate",

    async execute(message: Message, config) {
      // Ignorer les messages des bots
      if (message.author.bot) {
        return;
      }

      // Ne traiter que les messages dans les serveurs
      if (!message.guild) {
        return;
      }

      // Ne traiter que les messages dans les canaux textuels
      if (message.channel.type !== ChannelType.GuildText) {
        return;
      }

      // Ignorer les messages dans les fils de discussion
      if (message.channel.isThread()) {
        return;
      }

      if (!config) {
        return;
      }

      try {
        threadCreatorService.scheduleThreadForMessage(message, config);
      } catch (error) {
        logger.error(
          `Erreur dans le listener messageCreate du ThreadCreator : ${error}`
        );
      }
    },
  }
);
