import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const rngdleConfigSchema = {
  leaderboardChannel: {
    name: "Daily leaderboard channel",
    description:
      "Channel where yesterday's leaderboard is posted every day at 01:00 UTC, along with the linked members' new rolls.",
    type: ConfigType.CHANNEL,
  },
  shareCards: {
    name: "Cards on shared results",
    description:
      "Replies with a card when a member pastes their RNGdle result in a channel.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
} satisfies ConfigSchema;

export type RngdleConfigSchema = typeof rngdleConfigSchema;
