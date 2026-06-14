import type { ButtonInteraction } from "discord.js";
import {
  ConfigValidator,
  type ConfigProvider,
  type ConfigSchema,
  type ConfigType,
} from "#lib/config.js";
import type { Module } from "#lib/module.js";
import type { Registry } from "#lib/registry.js";

export abstract class ConfigTypeHandler<Type extends ConfigType> {
  protected constructor(private type: Type) {}

  public abstract replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    configuration: ConfigProvider<TSchema>,
    key: keyof TSchema,
    sourceMessageId: string
  ): Promise<void>;

  public abstract registerEditionInteractionHandlers(
    registry: Registry
  ): Promise<void>;

  public validate(value: string): boolean {
    return ConfigValidator[this.type](value);
  }
}
