import { GatewayIntentBits, Partials } from "discord.js";
import { defineModule } from "#lib/module.js";
import latexCommand from "./commands/latex.command.js";
import { latexConfigSchema } from "./latex.config.js";
import messageCreateListener from "./listeners/message-create.listener.js";
import messageDeleteBulkListener from "./listeners/message-delete-bulk.listener.js";
import messageDeleteListener from "./listeners/message-delete.listener.js";
import messageUpdateListener from "./listeners/message-update.listener.js";

export default defineModule({
  id: "latex",
  name: "LaTeX",
  description:
    "Renders LaTeX formulas as images with the /latex command, and the messages containing LaTeX.",
  version: "1.0.0",
  author: "LoicR",

  config: latexConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  partials: [Partials.Message],

  onLoad(_client, registry) {
    registry.register(latexCommand);
    registry.register(messageCreateListener);
    registry.register(messageUpdateListener);
    registry.register(messageDeleteListener);
    registry.register(messageDeleteBulkListener);
  },
});
