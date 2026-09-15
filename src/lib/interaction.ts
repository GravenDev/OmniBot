import type {
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import type { ConfigProvider, ConfigSchema } from "./config.js";
import { DeclarationType, type Declared } from "./declared.js";

export type CompatibleInteraction =
  | MessageComponentInteraction
  | ModalSubmitInteraction;

/**
 * Who may trigger an interaction. Declared per handler with no default, so a
 * new handler cannot silently end up public by omission.
 */
export type InteractionAccess = "admin" | "everyone";

export interface InteractionHandler<
  Interaction extends CompatibleInteraction,
  ConfigType extends ConfigSchema = {},
> {
  customId: string;

  /**
   * Who may trigger this interaction. Required on purpose: the dispatcher
   * enforces it centrally, and making it optional would mean an omitted flag
   * yields a public handler.
   */
  access: InteractionAccess;

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
