import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const fourHourGameConfigSchema = {
  channel: {
    name: "Game channel",
    description: "Channel where the game is played.",
    type: ConfigType.CHANNEL,
  },
  delay: {
    name: "Delay",
    description:
      "Time a message must stay the last one for its author to score a point.",
    type: ConfigType.DURATION,
    defaultValue: 4 * 60 * 60,
  },
} satisfies ConfigSchema;

export type FourHourGameConfigSchema = typeof fourHourGameConfigSchema;
