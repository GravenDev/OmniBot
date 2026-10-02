import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const rngdleConfigSchema = {
  leaderboardChannel: {
    name: "Daily leaderboard channel",
    description:
      "Channel where yesterday's leaderboard is posted every day at 01:00 UTC.",
    type: ConfigType.CHANNEL,
  },
} satisfies ConfigSchema;

export type RngdleConfigSchema = typeof rngdleConfigSchema;
