import type { JsonValue } from "@prisma/client/runtime/client";
import { client, modules } from "../../index.js";
import {
  ConfigProvider,
  ConfigType,
  type ConfigData,
  type ConfigSchema,
} from "../../lib/config.js";
import database from "../../lib/database.js";
import type { Module } from "../../lib/module.js";
import { declareService } from "../../lib/service.js";
import coreModule from "../core.module.js";

const configCache = new Map<string, Record<string, ConfigData<ConfigSchema>>>();

class ConfigService {
  async getConfigForModuleIn<ConfigType extends ConfigSchema>(
    module: Module<ConfigType>,
    guildId: string
  ): Promise<ConfigProvider<ConfigType>> {
    const config = await this.getOrCreate(guildId);
    const configData = config[module.id];

    // Deserialize the config data before creating the provider
    const deserializedConfig = await this.deserializeConfigData(
      module,
      configData as ConfigData<ConfigType>,
      guildId
    );

    return new ConfigProvider(module, deserializedConfig);
  }

  async updateConfigForModuleIn<ConfigType extends ConfigSchema>(
    module: Module<ConfigType>,
    guildId: string,
    newConfig: Partial<ConfigData<ConfigType>>
  ): Promise<ConfigProvider<ConfigType>> {
    const currentConfig = await this.getOrCreate(guildId);
    const moduleConfig = currentConfig[module.id] as ConfigData<ConfigType>;

    if (!moduleConfig) {
      throw new Error(
        `Unable to find configuration for module ${module.id} in guild ${guildId}`
      );
    }

    // Merge the new config with the existing config
    const updatedModuleConfig = { ...moduleConfig, ...newConfig };
    const updatedConfig = {
      ...currentConfig,
      [module.id]: updatedModuleConfig,
    };

    // Update the database
    await database.guildConfiguration.upsert({
      where: { guildId },
      create: { guildId, data: updatedConfig },
      update: { data: updatedConfig },
    });

    // Update the cache
    configCache.set(guildId, updatedConfig);

    // Deserialize the updated config before returning
    const deserializedConfig = await this.deserializeConfigData(
      module,
      updatedModuleConfig,
      guildId
    );

    return new ConfigProvider(module, deserializedConfig);
  }

  async resetConfigForModuleIn<ConfigType extends ConfigSchema>(
    module: Module<ConfigType>,
    guildId: string
  ): Promise<ConfigProvider<ConfigType>> {
    const defaultConfig = this.createDefaultConfigForModule(module);
    const currentConfig = await this.getOrCreate(guildId);

    const updatedConfig = {
      ...currentConfig,
      [module.id]: defaultConfig,
    };

    // Update the database
    await database.guildConfiguration.upsert({
      where: { guildId },
      create: { guildId, data: updatedConfig },
      update: { data: updatedConfig },
    });

    // Update the cache
    configCache.set(guildId, updatedConfig);

    // Deserialize the default config before returning
    const deserializedConfig = await this.deserializeConfigData(
      module,
      defaultConfig as ConfigData<ConfigType>,
      guildId
    );

    return new ConfigProvider(module, deserializedConfig);
  }

  async getFullConfigForGuild(
    guildId: string
  ): Promise<Record<string, ConfigData<ConfigSchema>>> {
    return this.getOrCreate(guildId);
  }

  async clearCacheForGuild(guildId: string): Promise<void> {
    configCache.delete(guildId);
  }

  private async getOrCreate(guildId: string) {
    if (configCache.has(guildId)) {
      return configCache.get(guildId)!;
    }

    const config = await database.guildConfiguration.findUnique({
      where: { guildId },
    });

    if (!config) {
      return this.createConfiguration(guildId);
    }

    const validatedConfig = this.validateConfig(config.data);
    configCache.set(guildId, validatedConfig);
    return validatedConfig;
  }

  private validateConfig(
    config: JsonValue
  ): Record<string, ConfigData<ConfigSchema>> {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("Invalid configuration format");
    }

    const validatedConfig: Record<string, ConfigData<ConfigSchema>> = {};

    // Validate each module's configuration
    for (const module of [...modules, coreModule]) {
      const moduleConfig = (config as Record<string, any>)[module.id];

      if (moduleConfig) {
        // Validate that the module config has all required fields
        const defaultConfig = this.createDefaultConfigForModule(module);
        validatedConfig[module.id] = { ...defaultConfig, ...moduleConfig };
      } else {
        // If module config is missing, create default
        validatedConfig[module.id] = this.createDefaultConfigForModule(module);
      }
    }

    return validatedConfig;
  }

  private async createConfiguration(
    guildId: string
  ): Promise<Record<string, ConfigData<ConfigSchema>>> {
    const config: Record<string, ConfigData<ConfigSchema>> = {};

    // Create default configuration for all modules
    for (const module of [...modules, coreModule]) {
      config[module.id] = this.createDefaultConfigForModule(module);
    }

    // Save to database
    await database.guildConfiguration.create({
      data: {
        guildId,
        data: config,
      },
    });

    // Cache the configuration
    configCache.set(guildId, config);

    return config;
  }

  private createDefaultConfigForModule<ConfigType extends ConfigSchema>(
    module: Module<ConfigType>
  ): ConfigData<ConfigType> {
    const defaultConfig: any = {};

    if (module.config) {
      for (const [key, configEntry] of Object.entries(module.config)) {
        if (configEntry.defaultValue !== undefined) {
          defaultConfig[key] = configEntry.defaultValue;
        } else {
          // Provide sensible defaults based on type
          if (Array.isArray(configEntry.type)) {
            defaultConfig[key] = [];
          } else {
            switch (configEntry.type) {
              case ConfigType.STRING:
                defaultConfig[key] = "";
                break;
              case ConfigType.NUMBER:
                defaultConfig[key] = 0;
                break;
              case ConfigType.BOOLEAN:
                defaultConfig[key] = false;
                break;
              default:
                defaultConfig[key] = null;
            }
          }
        }
      }
    }

    return defaultConfig as ConfigData<ConfigType>;
  }

  private async deserializeConfigData<ConfigType extends ConfigSchema>(
    module: Module<ConfigType>,
    configData: ConfigData<ConfigType>,
    guildId: string
  ): Promise<ConfigData<ConfigType>> {
    if (!module.config) {
      return configData;
    }

    const deserializedConfig: any = { ...configData };
    const guild = await client.guilds.fetch(guildId);

    for (const [key, configEntry] of Object.entries(module.config)) {
      const value = configData[key as keyof ConfigData<ConfigType>];

      if (value === null || value === undefined) {
        continue;
      }

      // Handle array types (lists)
      if (Array.isArray(configEntry.type)) {
        const listType = configEntry.type[0];
        if (Array.isArray(value)) {
          deserializedConfig[key] = await Promise.all(
            value.map(
              async (item) => await this.deserializeValue(item, listType, guild)
            )
          );
        }
      } else {
        // Handle single types
        deserializedConfig[key] = await this.deserializeValue(
          value,
          configEntry.type,
          guild
        );
      }
    }

    return deserializedConfig as ConfigData<ConfigType>;
  }

  private async deserializeValue(
    value: any,
    type: ConfigType,
    guild: any
  ): Promise<any> {
    if (value === null || value === undefined) {
      return value;
    }

    try {
      switch (type) {
        case ConfigType.USER:
          if (typeof value === "string") {
            // Extract ID from mention format or use direct ID
            const userMatch = value.match(/^<@!?(\d+)>$/);
            const userId = userMatch ? userMatch[1] : value;
            return await client.users.fetch(userId!);
          }
          return value;

        case ConfigType.ROLE:
          if (typeof value === "string") {
            // Extract ID from mention format or use direct ID
            const roleMatch = value.match(/^<@&(\d+)>$/);
            const roleId = roleMatch ? roleMatch[1] : value;
            return await guild.roles.fetch(roleId);
          }
          return value;

        case ConfigType.CHANNEL:
        case ConfigType.CATEGORY:
          if (typeof value === "string") {
            // Extract ID from mention format or use direct ID
            const channelMatch = value.match(/^<#(\d+)>$/);
            const channelId = channelMatch ? channelMatch[1] : value;
            return await guild.channels.fetch(channelId);
          }
          return value;

        case ConfigType.STRING:
        case ConfigType.NUMBER:
        case ConfigType.BOOLEAN:
        default:
          // These types don't need deserialization
          return value;
      }
    } catch (error) {
      // If deserialization fails, return the original value or null
      console.warn(`Failed to deserialize ${type} with value ${value}:`, error);
      return null;
    }
  }

  isConfigKey(
    module: Module,
    key: string | undefined
  ): key is keyof typeof module.config {
    return module.config ? (key ?? "") in module.config : false;
  }
}

export default declareService(new ConfigService());
