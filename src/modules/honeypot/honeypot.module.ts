import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import { honeypotConfigSchema } from "./honeypot.config.js";
import messageCreateListener from "./listeners/message-create.listener.js";

export default defineModule({
  id: "honeypot",
  name: "Honeypot",
  description:
    "Softbans whoever posts in a trap channel, to catch spam bots and hacked accounts.",
  version: "1.0.0",
  author: "LoicR",

  config: honeypotConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  onLoad(_client, registry) {
    registry.register(messageCreateListener);
  },
});
