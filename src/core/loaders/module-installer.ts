import type { Guild } from "discord.js";
import moduleService from "#core/services/module.service.js";
import { client } from "#index.js";
import type { Module } from "#lib/module.js";
import {
  installModuleCommandsIn,
  uninstallModuleCommandsIn,
} from "./command-loader.js";

export async function installModule(module: Module, guild: Guild) {
  // Check if the module is already installed
  const isInstalled = (await moduleService.getModuleStateIn(module.id, guild))
    .activated;

  if (isInstalled) {
    throw new Error(`Module ${module.id} is already installed in this guild.`);
  }

  // Install the commands
  await installModuleCommandsIn(client, module, guild);

  // Change the module state in the database
  await moduleService.enableModule(module.id, guild);
}

export async function uninstallModule(module: Module, guild: Guild) {
  const isInstalled = (await moduleService.getModuleStateIn(module.id, guild))
    .activated;

  if (!isInstalled) {
    throw new Error(`Module ${module.id} is not installed in this guild.`);
  }

  // Uninstall the commands
  await uninstallModuleCommandsIn(client, module, guild);

  // Change the module state in the database
  await moduleService.disableModule(module.id, guild);
}
