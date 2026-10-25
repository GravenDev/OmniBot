import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import channelDeleteListener from "./listeners/channel-delete.listener.js";
import messageCreateListener from "./listeners/message-create.listener.js";
import { stickyConfigSchema } from "./sticky.config.js";

export default defineModule({
  id: "sticky",
  name: "Sticky Messages",
  description:
    "Keeps a message at the bottom of configured channels by reposting it after every new message.",
  version: "2.0.0",
  author: "LoicR",

  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],

  config: stickyConfigSchema,

  onLoad(_client, registry) {
    registry.register(messageCreateListener);
    registry.register(channelDeleteListener);
  },
});
