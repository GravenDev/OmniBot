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
      "Also count the channels that @everyone cannot see. Enable it when @everyone sees no channel (access through a member role), and exclude the staff channels: they would be counted too.",
    type: ConfigType.BOOLEAN,
    defaultValue: false,
  },
  allowedRoles: {
    name: "Allowed roles",
    description:
      "Roles that can use /server-stats, besides administrators. Empty by default: administrators only.",
    type: [ConfigType.ROLE],
  },
  showTopMembers: {
    name: "Show most active members",
    description: "Lists the most active members in the report.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
} satisfies ConfigSchema;

export type ServerStatsConfigSchema = typeof serverStatsConfigSchema;
