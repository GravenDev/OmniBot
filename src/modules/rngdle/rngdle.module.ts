import { GatewayIntentBits } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import rngdleAdminCommand from "./commands/rngdle-admin.command.js";
import rngdleCommand from "./commands/rngdle.command.js";
import historyPageButton from "./interactions/history-page.button.js";
import navigationButton from "./interactions/navigation.button.js";
import overallPageButton from "./interactions/overall-page.button.js";
import unlinkConfirmButton from "./interactions/unlink-confirm.button.js";
import messageCreateListener from "./listeners/message-create.listener.js";
import { rngdleConfigSchema } from "./rngdle.config.js";
import { rngdleTasks } from "./tasks.js";

const logger = loggerMaker("rngdle");

const rngdleModule = defineModule({
  id: "rngdle",
  name: "RNGdle",
  description:
    "Tracks the members' rngdle.com rolls: leaderboards, profiles, histories, timelines, server statistics, a daily leaderboard and a card for each pasted result.",
  version: "1.3.1",
  author: "LoicR",

  config: rngdleConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  onLoad(_client, registry) {
    registry.register(rngdleCommand);
    registry.register(rngdleAdminCommand);
    registry.register(overallPageButton);
    registry.register(unlinkConfirmButton);
    registry.register(navigationButton);
    registry.register(historyPageButton);
    registry.register(messageCreateListener);
    for (const task of rngdleTasks(rngdleModule)) {
      registry.register(task);
    }
  },

  onInstall(_client, guild) {
    logger.info(`Module installed | guildId = ${guild.id}`);
  },

  onUninstall(_client, guild) {
    logger.info(`Module uninstalled | guildId = ${guild.id}`);
  },
});

export default rngdleModule;
