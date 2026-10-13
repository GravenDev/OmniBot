import { type Client } from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";

const logger = loggerMaker("listeners");

/**
 * Loads global listeners from the core registry and registers them with Discord.
 *
 * @param client The Discord client instance used to register the commands.
 */
export function loadGlobalEvents(client: Client) {
  const coreListeners = coreModule.registry.listeners;

  for (const listener of coreListeners) {
    client.on(listener.eventType, (...args) =>
      listener
        .execute(...args, undefined)
        .catch((err: unknown) =>
          logger.error({ err }, "Global listener execution failed")
        )
    );
  }
}

/**
 * Best-effort guild resolution for a raw client event payload. Only real
 * guild ids are returned: a member-like object resolves through its guild
 * (never its own user id), a reaction through its message, and a non-string `guildId` is ignored instead of
 * being passed to the database layer. Returns undefined for guild-less
 * events (DMs), in which case the listener runs without config.
 */
export function extractGuildId(args: unknown[]): string | undefined {
  for (const arg of args) {
    const guildId = ownGuildId(arg) ?? ownGuildId(messageOf(arg));
    if (guildId) return guildId;
  }
  return undefined;
}

function ownGuildId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { guild?: { id?: unknown }; guildId?: unknown };
  if (record.guild && typeof record.guild.id === "string") {
    return record.guild.id;
  }
  if (typeof record.guildId === "string") {
    return record.guildId;
  }
  return undefined;
}

function messageOf(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as { message?: unknown }).message;
}

/**
 * Loads module-specific listeners from the core registry and registers them with Discord.
 */
export function loadModuleEvents(client: Client, module: Module) {
  const moduleListeners = module.registry.listeners;
  if (moduleListeners.length === 0) {
    logger.info(`No listeners found for module ${module.id}`);
    return;
  }

  logger.info(
    `Loading module listeners | module = ${module.id} | count = ${moduleListeners.length}`
  );

  for (const listener of moduleListeners) {
    logger.info(`\tRegistering listener | event = ${listener.eventType}`);

    client.on(listener.eventType, (...args) => {
      const guildId = extractGuildId(args);

      if (guildId) {
        moduleService
          .getModuleStateFromGuildIdIn(module.id, guildId)
          .then((state) => {
            if (!state.activated) return;

            return configService
              .getConfigForModuleIn(module, guildId)
              .then((config) =>
                listener
                  .execute(...args, config)
                  .catch((err: unknown) =>
                    logger.error({ err }, "Listener execution failed")
                  )
              );
          })
          .catch((err: unknown) =>
            logger.error({ err }, "Failed to fetch module state")
          );
        return;
      }

      // If no guildId is found, execute the listener directly
      listener
        .execute(...args, undefined)
        .catch((err: unknown) =>
          logger.error({ err }, "Listener execution failed")
        );
    });
  }

  logger.info(`Loaded module listeners | module = ${module.id}`);
}
