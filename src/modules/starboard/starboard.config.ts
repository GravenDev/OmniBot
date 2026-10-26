import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const starboardConfigSchema = {
  channel: {
    name: "Starboard channel",
    description:
      "Channel where popular messages are reposted. Nothing is posted until it is set.",
    type: ConfigType.CHANNEL,
  },
  emojis: {
    name: "Emojis",
    description: "Reactions that count towards the starboard.",
    type: [ConfigType.EMOJI],
    defaultValue: ["⭐"],
  },
  threshold: {
    name: "Threshold",
    description:
      "Number of different members who must react for a message to be reposted.",
    type: ConfigType.NUMBER,
    defaultValue: 3,
  },
  selfStar: {
    name: "Self-star",
    description: "Counts the reaction of the message's author.",
    type: ConfigType.BOOLEAN,
    defaultValue: false,
  },
  ignoreBots: {
    name: "Ignore bots",
    description: "Never reposts messages sent by bots and webhooks.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
  allowedChannels: {
    name: "Watched channels",
    description:
      "Only these channels (and their threads) are watched. Empty: every channel.",
    type: [ConfigType.CHANNEL],
  },
  excludedChannels: {
    name: "Excluded channels",
    description: "Channels whose messages are never reposted.",
    type: [ConfigType.CHANNEL],
  },
  excludedCategories: {
    name: "Excluded categories",
    description: "Categories whose channels' messages are never reposted.",
    type: [ConfigType.CATEGORY],
  },
  belowThreshold: {
    name: "Below threshold",
    description:
      "What happens to a reposted message when its reactions fall below the threshold.",
    type: ConfigType.ENUM,
    options: ["keep", "remove"] as const,
    defaultValue: "keep",
  },
} satisfies ConfigSchema;

export type StarboardConfigSchema = typeof starboardConfigSchema;
