import { GatewayIntentBits } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import type { ScheduledTask } from "#lib/task.js";
import seniorityAdminCommand from "./commands/seniority-admin.command.js";
import { seniorityConfigSchema } from "./seniority.config.js";
import { clearGuild, remove } from "./services/overrides.js";
import { uninstallWarning } from "./services/uninstall.js";
import { seniorityMaintenanceTasks, seniorityTasks } from "./tasks.js";

const logger = loggerMaker("seniority");

const seniorityModule = defineModule({
  id: "seniority",
  name: "Member anniversaries",
  description:
    "Celebrates the members' anniversaries on the server, and the server's own.",
  version: "1.1.0",
  author: "AntoineJT",

  config: seniorityConfigSchema,

  // GuildMembers (privileged) to list the members and their join dates. The
  // message search of `/seniority-admin recompute` needs no gateway intent,
  // only the application's Message Content access (see
  // #lib/discord-polyfills/guild-message-search.ts).
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],

  onLoad(_client, registry) {
    registry.register(seniorityAdminCommand);
    for (const task of seniorityTasks(seniorityModule)) {
      registry.register(task);
    }
  },

  onInstall(_client, guild) {
    logger.info(`Module installed | guildId = ${guild.id}`);
  },

  // Recomputed seniorities are not kept for a reinstall. A failure cancels
  // the uninstall: the module stays enabled with them.
  async onUninstall(_client, guild) {
    await clearGuild(guild.id);
    logger.info(`Module uninstalled | guildId = ${guild.id}`);
  },

  uninstallWarning,

  maintenanceTasks: (): ScheduledTask[] =>
    seniorityMaintenanceTasks(seniorityModule.id),

  async deleteMemberData(guildId, userId) {
    await remove(guildId, userId);
  },
});

export default seniorityModule;
