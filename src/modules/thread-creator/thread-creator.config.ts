import { ConfigType, type ConfigSchema } from "#lib/config.js";

/**
 * Configuration schema for the Thread Creator module, edited via `/config
 * thread-creator`. Whether the module runs at all is governed by module
 * activation (`/modules`); an empty `channels` list simply means nothing is
 * watched yet.
 */
export const threadCreatorConfigSchema = {
  channels: {
    name: "Monitored channels",
    description:
      "Channels where new messages are monitored (a thread is created under each message).",
    type: [ConfigType.CHANNEL],
  },
  welcomeMessage: {
    name: "Welcome message",
    description: "Message automatically posted in each created thread.",
    type: ConfigType.STRING,
    defaultValue: "💬 Utilisez ce fil pour discuter de ce sujet !",
  },
  threadNameTemplate: {
    name: "Name template",
    description:
      "Thread name — variables: {messageAuthor}, {messageContent}, {timestamp}.",
    type: ConfigType.STRING,
    defaultValue: "Discussion - {messageAuthor}",
  },
} satisfies ConfigSchema;

export type ThreadCreatorConfigSchema = typeof threadCreatorConfigSchema;
