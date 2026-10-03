import { GatewayIntentBits } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import rngdleAdminCommand from "./commands/rngdle-admin.command.js";
import rngdleCommand from "./commands/rngdle.command.js";
import overallPageButton from "./interactions/overall-page.button.js";
import { rngdleConfigSchema } from "./rngdle.config.js";
import { rngdleTasks } from "./tasks.js";

const logger = loggerMaker("rngdle");

const rngdleModule = defineModule({
  id: "rngdle",
  name: "RNGdle",
  description:
    "Tracks the members' rngdle.com rolls: leaderboards, profiles, server statistics and a daily leaderboard.",
  version: "1.0.0",
  author: "LoicR",

  config: rngdleConfigSchema,

  intents: [GatewayIntentBits.Guilds],

  onLoad(_client, registry) {
    registry.register(rngdleCommand);
    registry.register(rngdleAdminCommand);
    registry.register(overallPageButton);
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
