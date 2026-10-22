import type {
  Message,
  PartialMessage,
  ReadonlyCollection,
  Snowflake,
} from "discord.js";
import { declareEventListener } from "#lib/listener.js";
import type { LatexConfigSchema } from "#modules/latex/latex.config.js";
import { removeReply } from "#modules/latex/services/chat.js";

export default declareEventListener<"messageDeleteBulk", LatexConfigSchema>({
  eventType: "messageDeleteBulk",

  async execute(
    messages: ReadonlyCollection<Snowflake, Message | PartialMessage>,
    _channel,
    config
  ) {
    if (config) {
      await Promise.all(messages.map((message) => removeReply(message)));
    }
  },
});
