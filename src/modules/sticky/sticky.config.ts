import { ChannelType } from "discord.js";
import { ConfigType, type ConfigSchema } from "#lib/config.js";
import { stickyRecords } from "./services/stickies.js";

const CONTENT_MAX = 2000;

export const stickyConfigSchema = {
  stickies: {
    name: "Sticky messages",
    description:
      "Channels with a message kept at the bottom, reposted after every new message.",
    type: ConfigType.CHANNEL_RECORDS,
    channel: {
      name: "Channel",
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    },
    fields: {
      content: {
        name: "Message",
        type: ConfigType.STRING,
        multiline: true,
        maxLength: CONTENT_MAX,
      },
    },
    source: stickyRecords,
  },
} satisfies ConfigSchema;
