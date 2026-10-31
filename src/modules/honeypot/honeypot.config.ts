import { ConfigType, type ConfigSchema } from "#lib/config.js";
import { MAX_BAN_PURGE_SECONDS } from "#lib/moderation.js";

export const honeypotConfigSchema = {
  trapChannels: {
    name: "Trap channels",
    description:
      "Channels nobody should write in. A member who posts there is softbanned. Nothing happens until one is set.",
    type: [ConfigType.CHANNEL],
  },
  logChannel: {
    name: "Log channel",
    description: "Channel where each triggered trap is logged.",
    type: ConfigType.CHANNEL,
  },
  counterChannel: {
    name: "Counter channel",
    description:
      "Channel where the bot keeps a message counting the members caught by the trap, updated after each catch.",
    type: ConfigType.CHANNEL,
  },
  exemptRoles: {
    name: "Exempt roles",
    description:
      "Members with one of these roles are never sanctioned, nor are members who can manage messages in the trap channel.",
    type: [ConfigType.ROLE],
  },
  purgeWindow: {
    name: "Purge window",
    description:
      "How far back the softban deletes the member's messages across the server (7 days at most).",
    type: ConfigType.DURATION,
    defaultValue: 60 * 60,
    max: MAX_BAN_PURGE_SECONDS,
  },
} satisfies ConfigSchema;

export type HoneypotConfigSchema = typeof honeypotConfigSchema;
