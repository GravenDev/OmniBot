import type { Client, Guild } from "discord.js";
import moduleService from "#core/services/module.service.js";
import { client } from "#index.js";
import type { Module } from "#lib/module.js";
import {
  installModuleCommandsIn,
  uninstallModuleCommandsIn,
} from "./command-loader.js";

/**
 * Narrows the ambient client to a ready one. Command registration needs
 * `token` and `user`, which only exist once the client is ready; failing loudly
 * here beats sending a request with an undefined application id.
 */
function readyClient(): Client<true> {
  if (!client.isReady()) {
    throw new Error("Discord client is not ready yet");
  }
  return client;
}

export async function installModule(module: Module, guild: Guild) {
  // Check if the module is already installed
  const isInstalled = (await moduleService.getModuleStateIn(module.id, guild))
    .activated;

  if (isInstalled) {
    throw new Error(`Module ${module.id} is already installed in this guild.`);
  }

  // Install the commands
  await installModuleCommandsIn(readyClient(), module, guild);

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
  await uninstallModuleCommandsIn(readyClient(), module, guild);

  // Change the module state in the database
  await moduleService.disableModule(module.id, guild);
}
