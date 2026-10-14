import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const serverStatsConfigSchema = {
  reportChannel: {
    name: "Report channel",
    description:
      "Channel where the previous day's statistics are posted every night. Nothing is posted until it is set.",
    type: ConfigType.CHANNEL,
  },
  excludedChannels: {
    name: "Excluded channels",
    description: "Channels whose activity is not counted.",
    type: [ConfigType.CHANNEL],
  },
  excludedCategories: {
    name: "Excluded categories",
    description: "Categories whose channels' activity is not counted.",
    type: [ConfigType.CATEGORY],
  },
  includePrivateChannels: {
    name: "Include private channels",
    description:
      "Also count the channels that @everyone cannot see. Enable it when @everyone sees no channel (access through a member role).",
    type: ConfigType.BOOLEAN,
    defaultValue: false,
  },
  showTopMembers: {
    name: "Show most active members",
    description: "Lists the most active members in the report.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
} satisfies ConfigSchema;

export type ServerStatsConfigSchema = typeof serverStatsConfigSchema;
