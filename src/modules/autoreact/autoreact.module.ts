import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import autoreactCommand from "./commands/autoreact.command.js";
import channelDeleteListener from "./listeners/channel-delete.listener.js";
import messageCreateListener from "./listeners/message-create.listener.js";

export default defineModule({
  id: "autoreact",
  name: "Auto React",
  description:
    "Automatically adds a reaction to every new message in configured channels.",
  version: "1.0.0",
  author: "LoicR",

  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],

  onLoad(_client, registry) {
    registry.register(autoreactCommand);
    registry.register(messageCreateListener);
    registry.register(channelDeleteListener);
  },
});
