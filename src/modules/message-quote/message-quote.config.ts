import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const messageQuoteConfigSchema = {
  excludedChannels: {
    name: "Excluded channels",
    description:
      "Channels whose messages are never quoted, and where posted links are not quoted.",
    type: [ConfigType.CHANNEL],
  },
  excludedCategories: {
    name: "Excluded categories",
    description: "Categories whose channels are treated as excluded channels.",
    type: [ConfigType.CATEGORY],
  },
  ignoredRoles: {
    name: "Ignored roles",
    description:
      "Optional roles (game, notification…) held only by members who also have the member role: ignored when comparing who sees the quoted channel and the destination.",
    type: [ConfigType.ROLE],
  },
} satisfies ConfigSchema;

export type MessageQuoteConfigSchema = typeof messageQuoteConfigSchema;
