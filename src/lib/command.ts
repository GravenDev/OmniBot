import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { ConfigProvider, ConfigSchema } from "./config.js";
import { DeclarationType, type Declared } from "./declared.js";

/**
 * Represents a command
 */
export interface Command<ConfigType extends ConfigSchema = {}> {
  /**
   * The command data used to register the command with Discord.
   */
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandBuilder
    | SlashCommandSubcommandGroupBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;

  /**
   * The function to execute when the command is invoked.
   *
   * @param interaction The interaction that triggered the command.
   * @param config The configuration for the module that registered the command.
   */
  execute: (
    interaction: ChatInputCommandInteraction,
    config: ConfigProvider<ConfigType>
  ) => Promise<void>;

  /**
   * Optional function to handle autocomplete interactions for the command.
   *
   * @param interaction The autocomplete interaction that triggered the command.
   * @param config The configuration for the module that registered the command.
   */
  complete?: (
    interaction: AutocompleteInteraction,
    config: ConfigProvider<ConfigType>
  ) => Promise<void>;
}

/**
 * Declares a command for dynamic import.
 *
 * @param command
 */
export function declareCommand<ConfigType extends ConfigSchema>(
  command: Command<ConfigType>
): Declared<Command<ConfigType>> {
  return {
    type: DeclarationType.Command,
    ...command,
  };
}
