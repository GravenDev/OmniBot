import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const rngdleConfigSchema = {
  leaderboardChannel: {
    name: "RNGdle channel",
    description:
      "Channel for the daily leaderboard and reminder, where members paste their results to get a card.",
    type: ConfigType.CHANNEL,
  },
  shareCards: {
    name: "Cards on shared results",
    description:
      "Replies with a card when a member pastes their RNGdle result in the RNGdle channel.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
} satisfies ConfigSchema;

export type RngdleConfigSchema = typeof rngdleConfigSchema;
