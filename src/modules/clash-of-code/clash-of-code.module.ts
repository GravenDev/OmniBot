import { GatewayIntentBits } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import { clashOfCodeConfigSchema } from "./clash-of-code.config.js";
import cocAdminCommand from "./commands/coc-admin.command.js";
import cocCommand from "./commands/coc.command.js";
import leaderboardPageButton from "./interactions/leaderboard-page.button.js";
import messageCreateListener from "./listeners/message-create.listener.js";
import store from "./services/store.js";
import watcher from "./services/watcher.js";
import { clashOfCodeTasks } from "./tasks.js";

const logger = loggerMaker("clash-of-code");

const clashOfCodeModule = defineModule({
  id: "clash-of-code",
  name: "Clash of Code",
  description:
    "Follows the Clash of Code games whose link is posted, posts their results and keeps a wins leaderboard.",
  version: "1.1.0",
  // Port of Alessevan's CoC bot (github.com/GravenDev/CoC), never deployed.
  author: "AntoineJT",

  config: clashOfCodeConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  onLoad(client, registry) {
    watcher.attach(client, clashOfCodeModule);
    registry.register(cocCommand);
    registry.register(cocAdminCommand);
    registry.register(leaderboardPageButton);
    registry.register(messageCreateListener);
    for (const task of clashOfCodeTasks()) {
      registry.register(task);
    }
  },

  onInstall(_client, guild) {
    logger.info(`Module installed | guildId = ${guild.id}`);
  },

  onUninstall(_client, guild) {
    logger.info(`Module uninstalled | guildId = ${guild.id}`);
  },

  async deleteMemberData(guildId, userId) {
    await store.unlink(guildId, userId);
  },
});

export default clashOfCodeModule;
