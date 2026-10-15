import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const reportsConfigSchema = {
  alertChannel: {
    name: "Alert channel",
    description:
      "Channel where moderators receive the reports. Nothing is reported until it is set.",
    type: ConfigType.CHANNEL,
  },
  emoji: {
    name: "Report emoji",
    description:
      "Reacting with this emoji reports the message. The reaction is removed right away.",
    type: ConfigType.EMOJI,
    defaultValue: "🚩",
  },
  moderatorRole: {
    name: "Moderator role",
    description: "Role mentioned when a new report arrives.",
    type: ConfigType.ROLE,
  },
  retention: {
    name: "Retention",
    description:
      "How long a closed report keeps its copy of the message before it is purged.",
    type: ConfigType.DURATION,
    defaultValue: 90 * 24 * 60 * 60,
  },
} satisfies ConfigSchema;

export type ReportsConfigSchema = typeof reportsConfigSchema;
