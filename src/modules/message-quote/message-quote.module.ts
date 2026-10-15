import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import deleteButton from "./interactions/delete.button.js";
import messageCreateListener from "./listeners/message-create.listener.js";
import { messageQuoteConfigSchema } from "./message-quote.config.js";

export default defineModule({
  id: "message-quote",
  name: "Message Quote",
  description:
    "Quotes the Discord messages whose link is posted, for members allowed to read them.",
  version: "1.0.0",
  author: "LoicR",

  config: messageQuoteConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  onLoad(_client, registry) {
    registry.register(messageCreateListener);
    registry.register(deleteButton);
  },
});
