import type { Message } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import { loggerMaker } from "#lib/logger.js";
import type { ClashOfCodeConfigSchema } from "#modules/clash-of-code/clash-of-code.config.js";
import { parseClashLinks } from "#modules/clash-of-code/services/links.js";
import watcher from "#modules/clash-of-code/services/watcher.js";

const logger = loggerMaker("clash-of-code");

export default declareEventListener<"messageCreate", ClashOfCodeConfigSchema>({
  eventType: "messageCreate",

  async execute(message: Message, config) {
    if (!config || message.author.bot || !message.inGuild()) {
      return;
    }
    const handles = parseClashLinks(message.content);
    if (handles.length === 0) {
      return;
    }
    const channels = config.get("channels") ?? [];
    const parentId = message.channel.isThread()
      ? message.channel.parentId
      : null;
    if (
      channels.length > 0 &&
      !channels.some(
        (channel) => channel.id === message.channelId || channel.id === parentId
      )
    ) {
      return;
    }

    for (const handle of handles) {
      try {
        if (await watcher.watch(message, handle)) {
          logger.info(
            `Clash watched | guildId = ${message.guildId} | handle = ${handle}`
          );
        }
      } catch (err) {
        logger.error(
          { err },
          `Could not watch the clash | guildId = ${message.guildId} | handle = ${handle}`
        );
      }
    }
  },
});
