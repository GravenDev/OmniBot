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
    description: "Channels or categories whose activity is not counted.",
    type: [ConfigType.CHANNEL],
  },
  includePrivateChannels: {
    name: "Include private channels",
    description:
      "Also count the channels that @everyone cannot see. Their names then appear in the public report.",
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
