import { GatewayIntentBits, Partials } from "discord.js";
import { defineModule } from "#lib/module.js";
import messageDeleteBulkListener from "./listeners/message-delete-bulk.listener.js";
import messageDeleteListener from "./listeners/message-delete.listener.js";
import messageUpdateListener from "./listeners/message-update.listener.js";
import { messageLogConfigSchema } from "./message-log.config.js";

export default defineModule({
  id: "message-log",
  name: "Message Log",
  description: "Logs deleted and edited messages in a staff channel.",
  version: "1.0.0",
  author: "LoicR",

  config: messageLogConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  partials: [Partials.Message],

  onLoad(_client, registry) {
    registry.register(messageDeleteListener);
    registry.register(messageDeleteBulkListener);
    registry.register(messageUpdateListener);
  },
});
