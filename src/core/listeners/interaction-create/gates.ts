import type { Guild } from "discord.js";
import coreModule from "#core/core.module.js";
import moduleService from "#core/services/module.service.js";
import type { Module } from "#lib/module.js";

// Whether the module is turned on in the guild; the core always is.
export async function moduleEnabled(
  module: Module,
  guild: Guild
): Promise<boolean> {
  return (
    module.id === coreModule.id ||
    (await moduleService.getModuleStateIn(module.id, guild)).activated
  );
}
