import { TIME_ZONES } from "#lib/calendar.js";
import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const birthdayConfigSchema = {
  channel: {
    name: "Announcement channel",
    description:
      "Channel where birthdays are announced. Nothing is announced until it is set.",
    type: ConfigType.CHANNEL,
  },
  role: {
    name: "Birthday role",
    description:
      "Role given for the day to members whose birthday is announced. It is removed from everyone else at the next announcement.",
    type: ConfigType.ROLE,
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
  messages: {
    name: "Birthday messages",
    description:
      "Messages drawn at random and quoted on the birthday card (keep them short: two lines at most); {user} is replaced by the member. Empty: the built-in messages.",
    type: [ConfigType.STRING],
  },
  paradoxMilestones: {
    name: "Birthday paradox milestones",
    description:
      "Announce when the registrations reach the birthday paradox milestones (23 members, first shared date, 57 members).",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
} satisfies ConfigSchema;

export type BirthdayConfigSchema = typeof birthdayConfigSchema;
