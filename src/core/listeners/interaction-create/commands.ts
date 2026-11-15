import {
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  MessageFlags,
} from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import { errorMessageKey } from "#core/utils/error-message.js";
import logger from "#lib/logger.js";
import { replyEphemeral } from "#lib/reply.js";
import { checkAccess, commandAccess } from "./access.js";
import { moduleEnabled } from "./gates.js";
import { findCommand } from "./routing.js";

export async function handleCommand(
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction
) {
  const command = findCommand(interaction.commandName, interaction.commandType);

  if (!command) {
    logger.warn(
      `Command not found | name = ${interaction.commandName} | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
    );
    if (interaction.guild && interaction.guildId) {
      const coreConfig = await configService.getConfigForModuleIn(
        coreModule,
        interaction.guildId
      );
      await interaction.reply({
        content: coreConfig.t("command.unavailable", {
          commandName: interaction.commandName,
        }),
        flags: MessageFlags.Ephemeral,
      });
    }
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

  if (!(await moduleEnabled(command.module, interaction.guild))) {
    logger.warn(
      `Command not enabled | name = ${interaction.commandName} | module = ${command.module.id} | guildId = ${interaction.guildId} | userId = ${interaction.user.id}`
    );
    await interaction.reply({
      content: coreConfig.t("command.notEnabled", {
        commandName: interaction.commandName,
      }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    !(await checkAccess(
      interaction,
      commandAccess(command.command),
      coreConfig.t
    ))
  ) {
    return;
  }

  const config = await configService.getConfigForModuleIn(
    command.module,
    interaction.guildId
  );

  logger.debug(`Executing command | name = ${interaction.commandName}`);
  try {
    await command.command.execute(interaction, config);
  } catch (err) {
    logger.error(
      { err },
      `Command failed | name = ${interaction.commandName} | module = ${command.module.id} | guildId = ${interaction.guildId} | channelId = ${interaction.channelId} | userId = ${interaction.user.id}`
    );
    try {
      await replyEphemeral(
        interaction,
        coreConfig.t(errorMessageKey(err, "command.failed"), {
          commandName: interaction.commandName,
        })
      );
    } catch {
      logger.debug(`Error reply failed | name = ${interaction.commandName}`);
    }
  }
}
