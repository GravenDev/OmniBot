import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const MAX_RETENTION_SECONDS = 30 * 24 * 60 * 60;

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
      "How long a closed report keeps its copy of the message before it is purged. A report is purged 30 days after it was made at the latest.",
    type: ConfigType.DURATION,
    defaultValue: MAX_RETENTION_SECONDS,
    max: MAX_RETENTION_SECONDS,
  },
} satisfies ConfigSchema;

export type ReportsConfigSchema = typeof reportsConfigSchema;
