import { GatewayIntentBits, Partials } from "discord.js";
import { defineModule } from "#lib/module.js";
import memberAddListener from "./listeners/member-add.listener.js";
import memberRemoveListener from "./listeners/member-remove.listener.js";
import messageCreateListener from "./listeners/message-create.listener.js";
import reactionAddListener from "./listeners/reaction-add.listener.js";
import { serverStatsConfigSchema } from "./server-stats.config.js";
import { serverStatsTasks } from "./tasks.js";

const serverStatsModule = defineModule({
  id: "server-stats",
  name: "Server Stats",
  description:
    "Counts the server's daily activity and posts a report every night.",
  version: "1.0.0",
  author: "LoicR",

  config: serverStatsConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],

  partials: [
    Partials.Message,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],

  onLoad(_client, registry) {
    registry.register(messageCreateListener);
    registry.register(reactionAddListener);
    registry.register(memberAddListener);
    registry.register(memberRemoveListener);
    for (const task of serverStatsTasks(serverStatsModule)) {
      registry.register(task);
    }
  },
});

export default serverStatsModule;
