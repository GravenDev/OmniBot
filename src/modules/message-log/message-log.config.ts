import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const messageLogConfigSchema = {
  logChannel: {
    name: "Log channel",
    description:
      "Channel where deleted and edited messages are logged. Nothing is logged until it is set.",
    type: ConfigType.CHANNEL,
  },
  excludedChannels: {
    name: "Excluded channels",
    description: "Channels or categories whose messages are not logged.",
    type: [ConfigType.CHANNEL],
  },
  logEdits: {
    name: "Log edits",
    description:
      "Also logs edited messages, with their content before and after.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
} satisfies ConfigSchema;

export type MessageLogConfigSchema = typeof messageLogConfigSchema;
