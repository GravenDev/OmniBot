import type { ClientEvents } from "discord.js";
import type { ConfigProvider, ConfigSchema } from "./config.js";
import { DeclarationType, type Declared } from "./declared.js";

/**
 * Represents a listener
 */
export interface EventListener<
  EventType extends keyof ClientEvents,
  ConfigType extends ConfigSchema = {},
> {
  /**
   * The type of the event listener, which corresponds to a key in ClientEvents.
   */
  eventType: EventType;

  /**
   * The configuration schema for the module that registered the listener.
   */
  configType?: ConfigType;

  /**
   * The function to execute when the event is triggered.
   *
   * @param event The event data that triggered the listener.
   * @param config The configuration for the module that registered the listener.
   * @param config The configuration for the module that registered the listener.
   * @returns A promise that resolves when the listener has finished executing.
   */
  execute: (
    ...args: [
      ...ClientEvents[EventType],
      ConfigProvider<ConfigType> | undefined,
    ]
  ) => Promise<void>;
}

/**
 * Declares a command for dynamic import.
 *
 * @param listener The event listener to declare.
 */
export function declareEventListener<
  EventType extends keyof ClientEvents,
  ConfigType extends ConfigSchema = {},
>(
  listener: EventListener<EventType, ConfigType>
): Declared<EventListener<EventType, ConfigType>> {
  return {
    type: DeclarationType.Listener,
    eventType: listener.eventType,
    execute: listener.execute,
  };
}
