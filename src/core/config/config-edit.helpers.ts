import { modules } from "../../index.js";
import type { Module } from "../../lib/module.js";
import coreModule from "../core.module.js";
import configService from "../services/config.service.js";
import { configurationMessage } from "../utils/core.messages.js";

/**
 * Resolves a configurable module (any installed module or the core module) by id.
 */
export function resolveConfigurableModule(
  moduleId: string | undefined
): Module | undefined {
  return [...modules, coreModule].find((module) => module.id === moduleId);
}

/**
 * Persists a single configuration value for a module and returns the refreshed
 * configuration message components.
 */
export async function saveConfigValue(
  module: Module,
  guildId: string,
  key: string,
  value: unknown
) {
  const updated = await configService.updateConfigForModuleIn(module, guildId, {
    [key]: value,
  });

  return configurationMessage(module, updated);
}
