import { ConfigType, type ConfigSchema } from "../../lib/config.js";

/**
 * Configuration schema for the Thread Creator module, edited via `/config
 * thread-creator`. Whether the module runs at all is governed by module
 * activation (`/modules`), so there is no separate "enabled" flag; an unset
 * `channel` simply means nothing is watched yet.
 */
export const threadCreatorConfigSchema = {
  channel: {
    name: "Canal surveillé",
    description: "Canal où surveiller les nouveaux messages.",
    type: ConfigType.CHANNEL,
  },
  welcomeMessage: {
    name: "Message de bienvenue",
    description: "Message posté automatiquement dans chaque fil créé.",
    type: ConfigType.STRING,
    defaultValue: "💬 Utilisez ce fil pour discuter de ce sujet !",
  },
  threadNameTemplate: {
    name: "Template de nom",
    description:
      "Nom des fils — variables : {messageAuthor}, {messageContent}, {timestamp}.",
    type: ConfigType.STRING,
    defaultValue: "Discussion - {messageAuthor}",
  },
} satisfies ConfigSchema;

export type ThreadCreatorConfigSchema = typeof threadCreatorConfigSchema;
