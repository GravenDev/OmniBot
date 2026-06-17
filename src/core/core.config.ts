import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const coreConfigSchema = {
  locale: {
    name: "Language",
    description: "Bot language",
    type: ConfigType.ENUM,
    options: ["en", "fr"] as const,
    defaultValue: "en",
    display: "language",
  },
} satisfies ConfigSchema;

export type CoreConfig = typeof coreConfigSchema;
