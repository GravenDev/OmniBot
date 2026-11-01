import { GatewayIntentBits, Partials } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import { birthdayConfigSchema } from "./birthday.config.js";
import birthdayAdminCommand from "./commands/birthday-admin.command.js";
import birthdayCommand from "./commands/birthday.command.js";
import guildMemberRemoveListener from "./listeners/guild-member-remove.listener.js";
import birthdayService from "./services/birthday.service.js";
import { uninstallWarning } from "./services/uninstall.js";
import { birthdayTasks } from "./tasks.js";

const logger = loggerMaker("birthday");

const birthdayModule = defineModule({
  id: "birthday",
  name: "Birthdays",
  description:
    "Wishes the members' birthdays, and puts the birthday paradox to the test.",
  version: "1.0.0",
  author: "AntoineJT",

  config: birthdayConfigSchema,

  // GuildMembers (privileged) to see departures, to list the members to catch
  // up on those missed while the bot was down, and those of a role for
  // `/birthday stats`. GuildVoiceStates (not privileged) for the people in a
  // voice channel, in `/birthday stats` too.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],

  // Departures of members missing from the cache are still delivered.
  partials: [Partials.GuildMember],

  onLoad(_client, registry) {
    registry.register(birthdayCommand);
    registry.register(birthdayAdminCommand);
    registry.register(guildMemberRemoveListener);
    for (const task of birthdayTasks(birthdayModule)) {
      registry.register(task);
    }
  },

  onInstall(_client, guild) {
    logger.info(`Module installed | guildId = ${guild.id}`);
  },

  // Unlike the core configuration, birthdays are not kept for a reinstall.
  onUninstall(_client, guild) {
    logger.info(`Module uninstalled | guildId = ${guild.id}`);
    birthdayService
      .clearGuild(guild.id)
      .catch((err: unknown) =>
        logger.error(
          { err },
          `Failed to clear the birthdays | guildId = ${guild.id}`
        )
      );
  },

  uninstallWarning,

  async deleteMemberData(guildId, userId) {
    await birthdayService.remove(guildId, userId);
  },
});

export default birthdayModule;
