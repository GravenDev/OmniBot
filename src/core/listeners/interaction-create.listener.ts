import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { modules } from "../../index.js";
import type { CompatibleInteraction } from "../../lib/interaction.js";
import { declareEventListener } from "../../lib/listener.js";
import logger from "../../lib/logger.js";
import coreModule from "../core.module.js";
import configService from "../services/config.service.js";
import moduleService from "../services/module.service.js";

async function handleCommand(interaction: ChatInputCommandInteraction) {
  const command = [...modules, coreModule]
    .flatMap((module) =>
      module.registry.commands.map((cmd) => ({
        module: module,
        command: cmd,
      }))
    )
    .find((cmd) => cmd.command.data.name === interaction.commandName);

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
    logger.warn(
      `Command not enabled | name = ${interaction.command?.name} | module = ${command.module.id}`
    );
    await interaction.reply({
      content: `The command \`${interaction.commandName}\` is not enabled in this guild.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleComplete(interaction: AutocompleteInteraction) {
  const command = [...modules, coreModule]
    .flatMap((module) =>
      module.registry.commands.map((cmd) => ({
        module: module,
        command: cmd,
      }))
    )
    .find((cmd) => cmd.command.data.name === interaction.commandName);

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
      `Command not enabled | name = ${interaction.command?.name} | module = ${command.module.id}`
    );
    await interaction.respond([]);
  }
}

async function handleInteraction(interaction: CompatibleInteraction) {
  const allModules = [...modules, coreModule];
  const [id, ...args] = interaction.customId.split(":");

  if (!id) {
    logger.warn(
      `Invalid interaction customId | customId = ${interaction.customId}`
    );
    return;
  }

  const handler = allModules
    .flatMap((module) =>
      module.registry.interactionHandlers.map((handler) => ({
        module: module,
        handler: handler,
      }))
    )
    .find((handler) => handler.handler.customId === id);

  if (!handler) {
    logger.warn(
      `Interaction handler not found | customId = ${interaction.customId}`
    );
    return;
  }

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

    await handler.handler.execute(interaction, args, config);
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
