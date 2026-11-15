import type {
  ClientEvents,
  DMChannel,
  NonThreadGuildBasedChannel,
} from "discord.js";
import type { ConfigProvider, ConfigSchema } from "./config.js";
import { DeclarationType, type Declared } from "./declared.js";
import { loggerMaker } from "./logger.js";

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
   * The function to execute when the event is triggered.
   *
   * @param event The event data that triggered the listener.
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
    ...listener,
  };
}

/**
 * A `channelDelete` listener that forgets what a module kept for a deleted
 * channel: `remove` deletes it and returns how many records went, `what`
 * names them in the log ("Sticky", "Auto-reaction"). Does nothing while the
 * module is inactive in the guild.
 */
export function removeOnChannelDelete(
  moduleName: string,
  what: string,
  remove: (guildId: string, channelId: string) => Promise<number>
) {
  const logger = loggerMaker(moduleName);
  return declareEventListener<"channelDelete">({
    eventType: "channelDelete",

    async execute(channel: DMChannel | NonThreadGuildBasedChannel, config) {
      if (!config || channel.isDMBased()) {
        return;
      }
      const removed = await remove(channel.guildId, channel.id);
      if (removed > 0) {
        logger.info(
          `${what} removed | reason = channel deleted | guildId = ${channel.guildId} | channelId = ${channel.id}`
        );
      }
    },
  });
}
