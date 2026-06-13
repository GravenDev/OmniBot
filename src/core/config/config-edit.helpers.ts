import { MessageFlags } from "discord.js";
import { modules } from "../../index.js";
import {
  ConfigType,
  type ConfigEntry,
  type ConfigSchema,
} from "../../lib/config.js";
import type { CompatibleInteraction } from "../../lib/interaction.js";
import { loggerMaker } from "../../lib/logger.js";
import type { Module } from "../../lib/module.js";
import coreModule from "../core.module.js";
import configService from "../services/config.service.js";
import { configurationMessage } from "../utils/core.messages.js";

const logger = loggerMaker("config");

/**
 * Resolves a configurable module (any installed module or the core module) by id.
 */
export function resolveConfigurableModule(
  moduleId: string | undefined
): Module | undefined {
  return [...modules, coreModule].find((module) => module.id === moduleId);
}

/**
 * Returns a module's config entry for a key, regardless of how the module's
 * schema is typed at the call site.
 */
export function getConfigEntry(
  module: Module,
  key: string
): ConfigEntry<ConfigType> | undefined {
  return (module.config as ConfigSchema)[key];
}

/** Whether a config entry holds a list (`ListOf<T>`) rather than a scalar. */
export function isListEntry(
  entry: ConfigEntry<ConfigType> | undefined
): boolean {
  return entry !== undefined && Array.isArray(entry.type);
}

/** Whether a config type is a plain scalar (edited via modal/editor, not a select). */
export function isScalarType(type: ConfigType): boolean {
  return (
    type === ConfigType.STRING ||
    type === ConfigType.NUMBER ||
    type === ConfigType.BOOLEAN
  );
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

/**
 * Re-renders the public `/config` message (identified by `sourceMessageId`) with
 * the module's current configuration.
 *
 * Used by the ephemeral list/select editors, whose own interactions can only
 * update their ephemeral message — this propagates the change back to the
 * original public config panel so it stays in sync.
 */
export async function refreshSourceConfigMessage(
  interaction: CompatibleInteraction,
  module: Module,
  sourceMessageId: string | undefined
): Promise<void> {
  if (!sourceMessageId || !interaction.channelId) {
    return;
  }

  const provider = await configService.getConfigForModuleIn(
    module,
    interaction.guildId!
  );

  try {
    // interaction.channel can be null (e.g. on modal submits), so fall back to
    // fetching the channel by id.
    const channel =
      interaction.channel ??
      (await interaction.client.channels.fetch(interaction.channelId));
    if (!channel?.isTextBased()) {
      return;
    }

    const message = await channel.messages.fetch(sourceMessageId);
    await message.edit({
      components: configurationMessage(module, provider),
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err) {
    logger.warn(
      { err },
      `Could not refresh source config message | id = ${sourceMessageId}`
    );
  }
}
