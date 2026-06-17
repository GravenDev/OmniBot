import { ConfigType, type ConfigSchema } from "#lib/config.js";

export const starboardConfigSchema = {
  starboardChannel: {
    name: "Salon starboard",
    description: "Salon où les messages starboardés sont repostés.",
    type: ConfigType.CHANNEL,
  },
  reactionEmojis: {
    name: "Émojis déclencheurs",
    description:
      "Émojis qui déclenchent le starboard (unicode ou custom <:name:id>).",
    type: [ConfigType.STRING],
    defaultValue: ["⭐"],
  },
  reactionCount: {
    name: "Seuil de réactions",
    description: "Nombre minimum de réactions pour starboarder un message.",
    type: ConfigType.NUMBER,
    defaultValue: 3,
  },
  selfStar: {
    name: "Auto-star",
    description: "Compter les réactions de l'auteur sur son propre message.",
    type: ConfigType.BOOLEAN,
    defaultValue: false,
  },
  allowedChannels: {
    name: "Salons surveillés",
    description: "Salons où surveiller les réactions (vide = tous les salons).",
    type: [ConfigType.CHANNEL],
  },
  ignoreBotMessages: {
    name: "Ignorer les bots",
    description: "Ne pas starboarder les messages de bots.",
    type: ConfigType.BOOLEAN,
    defaultValue: true,
  },
  belowThresholdBehavior: {
    name: "Sous le seuil",
    description:
      "Que faire quand les réactions repassent sous le seuil : 'remove' supprime l'entrée, 'keep' la garde.",
    type: ConfigType.ENUM,
    options: ["remove", "keep"] as const,
    defaultValue: "keep",
  },
  embedColor: {
    name: "Couleur de l'embed",
    description: "Couleur de la bordure de l'embed starboard.",
    type: ConfigType.ENUM,
    options: ["default", "gold", "blue", "green", "red"] as const,
    defaultValue: "gold",
  },
} satisfies ConfigSchema;

export type StarboardConfigSchema = typeof starboardConfigSchema;
