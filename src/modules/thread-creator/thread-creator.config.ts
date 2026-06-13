import { ConfigType, type ConfigSchema } from "../../lib/config.js";

/**
 * Configuration schema for the Thread Creator module, edited via `/config
 * thread-creator`. Whether the module runs at all is governed by module
 * activation (`/modules`); an empty `channels` list simply means nothing is
 * watched yet.
 */
export const threadCreatorConfigSchema = {
  channels: {
    name: "Salons surveillés",
    description:
      "Salons où surveiller les nouveaux messages (un fil est créé sous chaque message).",
    type: [ConfigType.CHANNEL],
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
