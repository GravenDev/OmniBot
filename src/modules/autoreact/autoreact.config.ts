import { ChannelType } from "discord.js";
import { ConfigType, type ConfigSchema } from "#lib/config.js";
import { reactionRecords } from "./services/reactions.js";

export const autoreactConfigSchema = {
  reactions: {
    name: "Automatic reactions",
    description:
      "Channels whose new messages get a reaction, and the emoji added.",
    type: ConfigType.CHANNEL_RECORDS,
    channel: {
      name: "Channel",
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    },
    fields: {
      emoji: { name: "Emoji", type: ConfigType.EMOJI },
    },
    source: reactionRecords,
  },
} satisfies ConfigSchema;
