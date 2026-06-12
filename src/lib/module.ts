import { type Client, GatewayIntentBits, type Guild } from "discord.js";
import type { ConfigSchema } from "./config.js";
import { DeclarationType, type Declared } from "./declared.js";
import { Registry } from "./registry.js";
import type { Version } from "./version.js";

export interface ModuleDeclaration<ConfigType extends ConfigSchema = {}> {
  /**
   * Unique identifier for the module.
   */
  id: string;

  /**
   * Name of the module.
   */
  name: string;

  /**
   * Description of the module.
   */
  description: string;

  /**
   * Version of the module.
   */
  version: Version;

  /**
   * Optional author of the module.
   */
  author?: string;

  /**
   * Intents that the module requires.
   */
  intents?: GatewayIntentBits[];

  /**
   * Configuration schema for the module.
   */
  config?: ConfigType;

  /**
   * Called when the module is initialized at startup.
   *
   * @param client The Discord client instance.
   */
  onLoad: (client: Client, registry: Registry) => void;

  /**
   * Called when the module is installed in a guild.
   *
   * @param client The Discord client instance.
   * @param guild The guild where the module is being installed.
   */
  onInstall: (client: Client, guild: Guild, registry: Registry) => void;

  /**
   * Called when the module is uninstalled from a guild.
   *
   * @param client The Discord client instance.
   * @param guild The guild from which the module is being uninstalled.
   */
  onUninstall: (client: Client, guild: Guild, registry: Registry) => void;
}

/**
 * Represents a module in the system.
 * A module is a self-contained unit of functionality that can be installed and uninstalled in a guild.
 */
export interface Module<
  ConfigType extends ConfigSchema = {},
> extends ModuleDeclaration<ConfigType> {
  /**
   * Registry for commands and other declarations made by the module.
   */
  registry: Registry;

  /**
   * Configuration schema for the module.
   */
  config: ConfigType;
}

/**
 * Defines a module with the required properties and methods.
 * @param module The module definition to declare.
 */
export function defineModule<ConfigType extends ConfigSchema>(
  module: ModuleDeclaration<ConfigType>
): Declared<Module<ConfigType>> {
  return {
    type: DeclarationType.Module,
    registry: new Registry(),
    ...module,
    config: module.config ?? ({} as ConfigType),
  };
}
