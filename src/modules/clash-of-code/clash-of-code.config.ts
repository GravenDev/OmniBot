import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const clashOfCodeConfigSchema = {
  channels: {
    name: "Watched channels",
    description:
      "Channels where posted Clash of Code links are followed. Leave empty to follow every channel.",
    type: [ConfigType.CHANNEL],
  },
} satisfies ConfigSchema;

export type ClashOfCodeConfigSchema = typeof clashOfCodeConfigSchema;
