import type { Message } from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import type { MessageQuoteConfigSchema } from "#modules/message-quote/message-quote.config.js";
import quoteService from "#modules/message-quote/services/quote.service.js";

export default declareEventListener<"messageCreate", MessageQuoteConfigSchema>({
  eventType: "messageCreate",

  async execute(message: Message, config) {
    if (!config || message.author.bot || !message.inGuild()) {
      return;
    }
    await quoteService.quoteLinks(message, config);
  },
});
