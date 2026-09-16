import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { requireAdmin } from "#core/utils/require-admin.js";
import { modules } from "#index.js";
import type { CompatibleInteraction } from "#lib/interaction.js";
import { declareEventListener } from "#lib/listener.js";
import logger from "#lib/logger.js";

function findCommand(commandName: string) {
  return [...modules, coreModule]
    .flatMap((module) =>
      module.registry.commands.map((cmd) => ({ module, command: cmd }))
    )
    .find((entry) => entry.command.data.name === commandName);
}

function findInteractionHandler(customId: string) {
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

async function handleCommand(interaction: ChatInputCommandInteraction) {
  const command = findCommand(interaction.commandName);

  if (!command) {
    logger.warn(`Command not found | name = ${interaction.commandName}`);
    return;
  }
  logger.debug(
    `Command found | name = ${command.command.data.name} | module = ${command.module.id}`
  );

  // Slash commands only run in guilds: without one there is no module state
  // nor config to load.
  if (!interaction.guild || !interaction.guildId) {
    logger.warn(`Command outside guild | name = ${interaction.commandName}`);
    return;
  }

  const coreConfig = await configService.getConfigForModuleIn(
    coreModule,
    interaction.guildId
  );

  const enabled =
    command.module.id === coreModule.id ||
    (await moduleService.getModuleStateIn(command.module.id, interaction.guild))
      .activated;

  if (!enabled) {
    logger.warn(
      `Command not enabled | name = ${interaction.commandName} | module = ${command.module.id}`
    );
    await interaction.reply({
      content: coreConfig.t("command.notEnabled", {
        commandName: interaction.commandName,
      }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (command.command.requiresAdmin) {
    if (!(await requireAdmin(interaction, coreConfig.t))) {
      return;
    }
  }

  const config = await configService.getConfigForModuleIn(
    command.module,
    interaction.guildId
  );

  logger.debug(`Executing command | name = ${interaction.commandName}`);
  try {
    await command.command.execute(interaction, config);
  } catch (err) {
    logger.error({ err }, `Command failed | name = ${interaction.commandName}`);
    const payload = {
      content: coreConfig.t("command.failed", {
        commandName: interaction.commandName,
      }),
      flags: MessageFlags.Ephemeral,
    } as const;
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {
      logger.debug(`Error reply failed | name = ${interaction.commandName}`);
    }
  }
}

async function handleComplete(interaction: AutocompleteInteraction) {
  const command = findCommand(interaction.commandName);

  if (!command) {
    logger.warn(
      `Command not found for autocomplete | name = ${interaction.commandName}`
    );
    return;
  }

  if (!interaction.guild || !interaction.guildId) {
    logger.warn(
      `Autocomplete outside guild | name = ${interaction.commandName}`
    );
    await interaction.respond([]);
    return;
  }

  if (
    command.module.id !== coreModule.id &&
    !(
      await moduleService.getModuleStateIn(command.module.id, interaction.guild)
    ).activated
  ) {
    logger.warn(
      `Command not enabled | name = ${interaction.commandName} | module = ${command.module.id}`
    );
    await interaction.respond([]);
    return;
  }

  // The module's own config, like handleCommand: complete() is typed against
  // the command's schema, so handing it the core config would lie at runtime.
  const config = await configService.getConfigForModuleIn(
    command.module,
    interaction.guildId
  );

  logger.debug(`Handling autocomplete | name = ${interaction.commandName}`);
  try {
    await command.command.complete?.(interaction, config);
  } catch (err) {
    logger.error(
      { err },
      `Autocomplete failed | name = ${interaction.commandName}`
    );
    try {
      await interaction.respond([]);
    } catch {
      logger.debug(
        `Autocomplete fallback failed | name = ${interaction.commandName}`
      );
    }
  }
}

async function handleInteraction(interaction: CompatibleInteraction) {
  const [id, ...args] = interaction.customId.split(":");

  if (!id) {
    logger.warn(
      `Invalid interaction customId | customId = ${interaction.customId}`
    );
    return;
  }

  const handler = findInteractionHandler(id);

  if (!handler) {
    logger.warn(
      `Interaction handler not found | customId = ${interaction.customId}`
    );
    return;
  }

  logger.debug(
    `Interaction handler found | customId = ${interaction.customId} | module = ${handler.module.id}`
  );

  if (
    handler.module.id === coreModule.id ||
    (
      await moduleService.getModuleStateIn(
        handler.module.id,
        interaction.guild!
      )
    ).activated
  ) {
    const config = await configService.getConfigForModuleIn(
      handler.module,
      interaction.guildId!
    );

    // Read before check(): a rejecting type predicate narrows `interaction`
    // to never below.
    const checkedCustomId = interaction.customId;
    if (!handler.handler.check(interaction, config)) {
      logger.debug(
        `Interaction check rejected | customId = ${checkedCustomId}`
      );
      return;
    }

    if (handler.handler.access === "admin") {
      const coreConfig = await configService.getConfigForModuleIn(
        coreModule,
        interaction.guildId!
      );
      if (!(await requireAdmin(interaction, coreConfig.t))) {
        return;
      }
    }

    try {
      logger.debug(
        `Executing interaction | customId = ${interaction.customId}`
      );
      await handler.handler.execute(interaction, args, config);
    } catch (err) {
      logger.error(
        { err },
        `Interaction handler failed | customId = ${interaction.customId}`
      );
    }
  }
}

export default declareEventListener({
  eventType: "interactionCreate",
  execute: async (interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      await handleComplete(interaction);
      return;
    }

    if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
      await handleInteraction(interaction);
    }
  },
});
