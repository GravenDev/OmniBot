import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const messageQuoteConfigSchema = {
  excludedChannels: {
    name: "Excluded channels",
    description:
      "Channels or categories whose messages are never quoted, and where posted links are not quoted.",
    type: [ConfigType.CHANNEL],
  },
} satisfies ConfigSchema;

export type MessageQuoteConfigSchema = typeof messageQuoteConfigSchema;
