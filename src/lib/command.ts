import {
  ApplicationCommandType,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type ContextMenuCommandBuilder,
  type MessageContextMenuCommandInteraction,
  type SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandBuilder,
  type SlashCommandSubcommandGroupBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
  type UserContextMenuCommandInteraction,
} from "discord.js";
import type { ConfigProvider, ConfigSchema } from "./config.js";
import { DeclarationType, type Declared } from "./declared.js";

export type CommandInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;

/**
 * Represents a command
 */
export interface Command<
  ConfigType extends ConfigSchema = {},
  Interaction extends CommandInteraction = ChatInputCommandInteraction,
> {
  /**
   * The command data used to register the command with Discord.
   */
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandBuilder
    | SlashCommandSubcommandGroupBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | ContextMenuCommandBuilder;

  /**
   * When true, the command is only executed for guild administrators; the
   * permission check is enforced centrally by the command dispatcher.
   * Defense in depth on top of `setDefaultMemberPermissions`.
   */
  requiresAdmin?: boolean;

  /**
   * The function to execute when the command is invoked.
   *
   * @param interaction The interaction that triggered the command.
   * @param config The configuration for the module that registered the command.
   */
  execute: (
    interaction: Interaction,
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
export function declareCommand<
  ConfigType extends ConfigSchema,
  Interaction extends CommandInteraction = ChatInputCommandInteraction,
>(
  command: Command<ConfigType, Interaction>
): Declared<Command<ConfigType, Interaction>> {
  return {
    type: DeclarationType.Command,
    ...command,
  };
}

export function commandType(
  command: Pick<Command<any, any>, "data">
): ApplicationCommandType {
  const data = command.data as { type?: ApplicationCommandType };
  return data.type ?? ApplicationCommandType.ChatInput;
}
