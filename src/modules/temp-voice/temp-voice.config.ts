import { ChannelType } from "discord.js";
import {
  ConfigType,
  type ConfigProvider,
  type ConfigSchema,
} from "#lib/config.js";
import { hubRecords } from "./services/hubs.js";

export const tempVoiceConfigSchema = {
  hubs: {
    name: "Hubs",
    description:
      "Voice channels that create a temporary voice channel for whoever joins them. In the name, {user} is replaced by the member's display name. A limit of 0 means no limit.",
    type: ConfigType.CHANNEL_RECORDS,
    channel: {
      name: "Hub",
      channelTypes: [ChannelType.GuildVoice],
    },
    fields: {
      name: {
        name: "Channel name",
        type: ConfigType.STRING,
        maxLength: 100,
      },
      limit: {
        name: "User limit (0-99)",
        type: ConfigType.STRING,
        maxLength: 2,
      },
    },
    source: hubRecords,
  },
} satisfies ConfigSchema;

export type TempVoiceConfigSchema = typeof tempVoiceConfigSchema;
export type TempVoiceConfig = ConfigProvider<TempVoiceConfigSchema>;
