import type { ApplicationCommandType } from "discord.js";
import coreModule from "#core/core.module.js";
import { modules } from "#core/runtime.js";
import { commandType } from "#lib/command.js";
import logger from "#lib/logger.js";

// The command an interaction targets, by name and type, among the loaded
// modules and the core, with the module declaring it.
export function findCommand(commandName: string, type: ApplicationCommandType) {
  return [...modules, coreModule]
    .flatMap((module) =>
      module.registry.commands.map((cmd) => ({ module, command: cmd }))
    )
    .find(
      (entry) =>
        entry.command.data.name === commandName &&
        commandType(entry.command) === type
    );
}

// The button, menu or modal handler a customId prefix targets, with the
// module declaring it; when two modules declare the prefix, the first one
// wins and a warning names them.
export function findInteractionHandler(customId: string) {
  const matches = [...modules, coreModule]
    .flatMap((module) =>
      module.registry.interactionHandlers.map((handler) => ({
        module,
        handler,
      }))
    )
    .filter((entry) => entry.handler.customId === customId);

  if (matches.length > 1) {
    logger.warn(
      `Duplicate interaction customId, first match wins | customId = ${customId} | modules = ${matches.map((entry) => entry.module.id).join(",")}`
    );
  }

  return matches[0];
}
