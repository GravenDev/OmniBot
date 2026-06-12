import type {
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import type { ConfigProvider, ConfigSchema } from "./config.js";
import { DeclarationType, type Declared } from "./declared.js";

export type CompatibleInteraction =
  | MessageComponentInteraction
  | ModalSubmitInteraction;

export interface InteractionHandler<
  Interaction extends CompatibleInteraction,
  ConfigType extends ConfigSchema = {},
> {
  customId: string;
  check: (
    interaction: CompatibleInteraction,
    config: ConfigProvider<ConfigType>
  ) => interaction is Interaction;
  execute: (
    interaction: Interaction,
    args: string[],
    config: ConfigProvider<ConfigType>
  ) => Promise<void>;
}

export function declareInteractionHandler<T extends CompatibleInteraction>(
  handler: InteractionHandler<T>
): Declared<InteractionHandler<T>> {
  return {
    type: DeclarationType.Interaction,
    ...handler,
  };
}
