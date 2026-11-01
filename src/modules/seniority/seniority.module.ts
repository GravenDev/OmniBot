import { GatewayIntentBits } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import { seniorityConfigSchema } from "./seniority.config.js";
import { seniorityTasks } from "./tasks.js";

const logger = loggerMaker("seniority");

const seniorityModule = defineModule({
  id: "seniority",
  name: "Member anniversaries",
  description:
    "Celebrates the members' anniversaries on the server, and the server's own.",
  version: "1.0.0",
  author: "AntoineJT",

  config: seniorityConfigSchema,

  // GuildMembers (privileged) to list the members and their join dates.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],

  onLoad(_client, registry) {
    for (const task of seniorityTasks(seniorityModule)) {
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

export default seniorityModule;
