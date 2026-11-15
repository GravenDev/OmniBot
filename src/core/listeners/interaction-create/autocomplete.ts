import {
  ApplicationCommandType,
  type AutocompleteInteraction,
} from "discord.js";
import configService from "#core/services/config.service.js";
import logger from "#lib/logger.js";
import { moduleEnabled } from "./gates.js";
import { findCommand } from "./routing.js";

export async function handleComplete(interaction: AutocompleteInteraction) {
  const command = findCommand(
    interaction.commandName,
    ApplicationCommandType.ChatInput
  );

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

  if (!(await moduleEnabled(command.module, interaction.guild))) {
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
      `Autocomplete failed | name = ${interaction.commandName} | module = ${command.module.id} | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
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
