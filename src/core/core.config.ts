import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const coreConfigSchema = {
  locale: {
    name: "Language",
    description: "Bot language (en/fr)",
    type: ConfigType.ENUM,
    options: ["en", "fr"] as const,
    defaultValue: "en",
  },
} satisfies ConfigSchema;

export type CoreConfig = typeof coreConfigSchema;
