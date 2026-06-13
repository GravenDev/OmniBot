import { type Client, type Guild, REST, Routes } from "discord.js";
import { devGuildId } from "../../lib/env.js";
import { loggerMaker } from "../../lib/logger.js";
import type { Module } from "../../lib/module.js";
import type { Version } from "../../lib/version.js";
import coreModule from "../core.module.js";
import moduleService from "../services/module.service.js";
import { compareVersions } from "../utils/version-parser.js";

const logger = loggerMaker("commands");

/**
 * Registers the core commands globally (production). Global commands can take
 * up to ~1h to propagate; for fast iteration in development use
 * {@link loadDevGuildCommands} instead.
 *
 * @param client The Discord client instance used to register the commands.
 */
export async function loadGlobalCommands(client: Client) {
  logger.info("Loading global commands");

  const coreCommands = coreModule.registry.commands.map((command) =>
    command.data.toJSON()
  );

  const rest = new REST().setToken(client.token!);
  try {
    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: coreCommands,
    });
    coreCommands.forEach((command) => {
      logger.info(`\tRegistering command | name = ${command.name}`);
    });
    logger.info(
      `Successfully loaded global commands | count = ${coreCommands.length}`
    );
  } catch (error) {
    logger.error(`Failed to load commands | error = ${error}`);
  }
}

/**
 * Registers commands on the dev guild in a single bulk overwrite: the core
 * commands plus the commands of every module enabled on that guild.
 *
 * Guild commands propagate instantly, which makes iteration fast. A single PUT
 * is used (rather than a global PUT for core + per-module POSTs) because mixing
 * a destructive bulk PUT with additive POSTs on the same guild scope would let
 * the PUT wipe the POSTed module commands.
 */
export async function loadDevGuildCommands(client: Client, modules: Module[]) {
  const guildId = devGuildId();
  if (!guildId) {
    logger.error(
      "DEV_GUILD_ID is required in development mode to register commands"
    );
    return;
  }

  const commands = coreModule.registry.commands.map((command) =>
    command.data.toJSON()
  );

  for (const module of modules) {
    if (module.registry.commands.length === 0) {
      continue;
    }

    const state = await moduleService.getModuleStateFromGuildIdIn(
      module.id,
      guildId
    );
    if (!state.activated) {
      logger.info(
        `Skipping commands for disabled module on dev guild | module = ${module.id}`
      );
      continue;
    }

    commands.push(
      ...module.registry.commands.map((command) => command.data.toJSON())
    );
  }

  const rest = new REST().setToken(client.token!);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), {
      body: commands,
    });
    commands.forEach((command) => {
      logger.info(`\tRegistering command | name = ${command.name}`);
    });
    logger.info(
      `Successfully loaded dev guild commands | guildId = ${guildId} | count = ${commands.length}`
    );
  } catch (error) {
    logger.error(`Failed to load dev guild commands | error = ${error}`);
  }
}

export async function installModuleCommandsIn(
  client: Client,
  module: Module,
  guild: Guild
) {
  logger.info(
    `Installing module commands for "${module.id}" in guild "${guild.id}"`
  );

  const commands = module.registry.commands.map((command) =>
    command.data.toJSON()
  );

  const rest = new REST().setToken(client.token!);

  try {
    const createPromises = commands.map((command) => {
      logger.info(`\tCreating command | name = ${command.name}`);

      return rest.post(
        Routes.applicationGuildCommands(client.user!.id, guild.id),
        {
          body: command,
        }
      );
    });

    await Promise.all(createPromises);

    logger.info(
      `Successfully loaded commands for module "${module.id}" in guild "${guild.id}" | count = ${commands.length}`
    );
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to load commands for module "${module.id}" in guild "${guild.id}"`
    );
  }
}

export async function uninstallModuleCommandsIn(
  _: Client,
  module: Module,
  guild: Guild
) {
  logger.info(
    `Uninstalling module commands for "${module.id}" in guild "${guild.id}"`
  );

  try {
    const commands = await guild.commands.fetch();

    const moduleCommands = module.registry.commands.map((cmd) => cmd.data.name);
    const commandsToDelete = commands.filter((cmd) =>
      moduleCommands.includes(cmd.name)
    );

    const deletePromises = commandsToDelete.map((cmd) => {
      logger.info(`\tDeleting command | name = ${cmd.name}`);
      return guild.commands.delete(cmd.id);
    });

    await Promise.all(deletePromises);

    logger.info(
      `Successfully uninstalled commands for module "${module.id}" in guild "${guild.id}"`
    );
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to uninstall commands for module "${module.id}" in guild "${guild.id}"`
    );
  }
}

export async function updateModuleCommandsIn(
  client: Client,
  module: Module,
  guild: Guild
) {
  logger.info(
    `Updating module commands for "${module.id}" in guild "${guild.id}"`
  );

  await uninstallModuleCommandsIn(client, module, guild);
  await installModuleCommandsIn(client, module, guild);
}

export async function checkCommandsForVersionChange(
  client: Client,
  module: Module
) {
  logger.info(
    `Checking commands for version change in module "${module.id}" | current version = ${module.version}`
  );

  const guildInfos = await moduleService.getGuildsWhereVersionDoesNotMatch(
    module,
    module.version
  );

  if (guildInfos.length === 0) {
    logger.info(
      `No guilds found with version mismatch for module "${module.id}"`
    );
    return;
  }

  logger.info(
    `\tFound ${guildInfos.length} guilds with version mismatch for module "${module.id}"`
  );

  const guildsToFix = guildInfos.filter(
    (info) =>
      compareVersions(info.currentVersion as Version, module.version) < 0
  );
  logger.info(
    `\tFound ${guildsToFix.length} guilds to update commands for module "${module.id}"`
  );

  const guilds = await Promise.all(
    guildsToFix.map(async (info) => await client.guilds.fetch(info.guildId))
  );

  for (const guild of guilds) {
    logger.info(
      `\tUpdating commands in guild "${guild.id}" for module "${module.id}"`
    );

    await updateModuleCommandsIn(client, module, guild);
    await moduleService.updateModuleActivation(
      module.id,
      guild.id,
      module.version
    );
    logger.info(
      `\tSuccessfully updated commands in guild "${guild.id}" for module "${module.id}"`
    );
  }

  logger.info(
    `Finished checking commands for version change in module "${module.id}"`
  );
}
