import { TIME_ZONES } from "#lib/calendar.js";
import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const seniorityConfigSchema = {
  channel: {
    name: "Announcement channel",
    description:
      "Channel where member anniversaries are announced, and the server's anniversary unless it has its own. Unset: member anniversaries are not announced.",
    type: ConfigType.CHANNEL,
  },
  serverChannel: {
    name: "Server anniversary channel",
    description:
      "Channel where the server's anniversary is announced. Unset: the announcement channel.",
    type: ConfigType.CHANNEL,
  },
  timeZone: {
    name: "Time zone",
    description: "Time zone the server's days follow.",
    type: ConfigType.ENUM,
    options: TIME_ZONES,
    defaultValue: "Europe/Paris",
  },
  hour: {
    name: "Announcement hour",
    description: "Hour of the day (0 to 23) when the announcements are posted.",
    type: ConfigType.NUMBER,
    defaultValue: 9,
  },
  memberAnniversaries: {
    name: "Member anniversaries",
    description:
      "Announce the members who have been on the server for another full year.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
  serverAnniversary: {
    name: "Server anniversary",
    description: "Announce the anniversary of the server's creation.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
  loopCard: {
    name: "Loop the cards",
    description:
      "Replay the animated cards (member and server anniversaries) forever, resting on the landed confetti between two throws. Off: they play once.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
} satisfies ConfigSchema;

export type SeniorityConfigSchema = typeof seniorityConfigSchema;
