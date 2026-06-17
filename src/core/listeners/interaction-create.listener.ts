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
  return [...modules, coreModule]
    .flatMap((module) =>
      module.registry.interactionHandlers.map((handler) => ({
        module,
        handler,
      }))
    )
    .find((entry) => entry.handler.customId === customId);
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

  if (
    command.module.id === coreModule.id ||
    (
      await moduleService.getModuleStateIn(
        command.module.id,
        interaction.guild!
      )
    ).activated
  ) {
    const config = await configService.getConfigForModuleIn(
      command.module,
      interaction.guildId!
    );

    logger.debug(`Executing command | name = ${interaction.commandName}`);
    await command.command.execute(interaction, config);
  } else {
    const coreConfig = await configService.getConfigForModuleIn(
      coreModule,
      interaction.guildId!
    );

    logger.warn(
      `Command not enabled | name = ${interaction.commandName} | module = ${command.module.id}`
    );
    await interaction.reply({
      content: coreConfig.t("command.notEnabled", {
        commandName: interaction.commandName,
      }),
      flags: MessageFlags.Ephemeral,
    });
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

  if (
    command.module.id === coreModule.id ||
    (
      await moduleService.getModuleStateIn(
        command.module.id,
        interaction.guild!
      )
    ).activated
  ) {
    const config = await configService.getConfigForModuleIn(
      coreModule,
      interaction.guildId!
    );

    if (
      command.module.id === coreModule.id ||
      (
        await moduleService.getModuleStateIn(
          command.module.id,
          interaction.guild!
        )
      ).activated
    ) {
      logger.debug(`Handling autocomplete | name = ${interaction.commandName}`);
      await command.command.complete?.(interaction, config);
    } else {
      logger.warn(
        `Command not enabled | name = ${interaction.command?.name} | module = ${command.module.id}`
      );
      await interaction.respond([]);
    }
  } else {
    logger.warn(
      `Command not enabled | name = ${interaction.commandName} | module = ${command.module.id}`
    );
    await interaction.respond([]);
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

    if (!handler.handler.check(interaction, config)) return;

    if (handler.handler.requiresAdmin) {
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
