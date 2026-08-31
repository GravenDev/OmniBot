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
      const guildId =
        args.find((arg) => !!arg?.guild)?.guild?.id ||
        args.find((arg) => !!arg?.guildId)?.guildId ||
        args.find((arg) => !!arg?.message?.guild)?.message?.guildId ||
        args.find((arg) => !!arg?.message?.guildId)?.message?.guildId;

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
