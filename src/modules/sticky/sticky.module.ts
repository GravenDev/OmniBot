import { GatewayIntentBits } from "discord.js";
import { defineModule } from "#lib/module.js";
import stickyCommand from "./commands/sticky.command.js";
import stickyModal from "./interactions/sticky.modal.js";
import channelDeleteListener from "./listeners/channel-delete.listener.js";
import messageCreateListener from "./listeners/message-create.listener.js";

export default defineModule({
  id: "sticky",
  name: "Sticky Messages",
  description:
    "Keeps a message at the bottom of configured channels by reposting it after every new message.",
  version: "1.0.0",
  author: "LoicR",

  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],

  onLoad(_client, registry) {
    registry.register(stickyCommand);
    registry.register(stickyModal);
    registry.register(messageCreateListener);
    registry.register(channelDeleteListener);
  },
});
