import { ConfigType } from "../../lib/config.js";
import logger from "../../lib/logger.js";
import { defineModule } from "../../lib/module.js";

/**
 * Development-only module exercising every configuration field type.
 *
 * It declares no commands or listeners — its sole purpose is to give
 * `/config test-config` a schema covering every {@link ConfigType}, scalar and
 * list, so the configuration UI (modals, toggle, entity select menus, multi-
 * selects and the scalar list editor) can be exercised end-to-end on a real
 * Discord server. Loaded only in dev mode.
 */
export default defineModule({
  id: "test-config",
  name: "Test Config",
  description:
    "Module de développement déclarant tous les types de configuration, pour tester l'UI de configuration.",
  version: "1.0.0",
  author: "OmniBot",
  devOnly: true,

  config: {
    text: {
      name: "Texte",
      description: "Un champ texte libre.",
      type: ConfigType.STRING,
      defaultValue: "valeur par défaut",
    },
    number: {
      name: "Nombre",
      description: "Un champ numérique.",
      type: ConfigType.NUMBER,
      defaultValue: 42,
    },
    toggle: {
      name: "Booléen",
      description: "Un interrupteur on/off.",
      type: ConfigType.BOOLEAN,
      defaultValue: false,
    },
    user: {
      name: "Utilisateur",
      description: "Un utilisateur Discord.",
      type: ConfigType.USER,
    },
    role: {
      name: "Rôle",
      description: "Un rôle Discord.",
      type: ConfigType.ROLE,
    },
    channel: {
      name: "Salon",
      description: "Un salon Discord.",
      type: ConfigType.CHANNEL,
    },
    category: {
      name: "Catégorie",
      description: "Une catégorie Discord.",
      type: ConfigType.CATEGORY,
    },
    textList: {
      name: "Liste de textes",
      description: "Une liste de chaînes (éditeur ajouter/supprimer).",
      type: [ConfigType.STRING],
      defaultValue: ["alpha", "beta"],
    },
    numberList: {
      name: "Liste de nombres",
      description: "Une liste de nombres (éditeur ajouter/supprimer).",
      type: [ConfigType.NUMBER],
    },
    boolList: {
      name: "Liste de booléens",
      description: "Une liste de booléens (éditeur ajouter/supprimer).",
      type: [ConfigType.BOOLEAN],
      defaultValue: [true, false],
    },
    roleList: {
      name: "Liste de rôles",
      description: "Plusieurs rôles Discord (multi-select).",
      type: [ConfigType.ROLE],
    },
    channelList: {
      name: "Liste de salons",
      description: "Plusieurs salons Discord (multi-select).",
      type: [ConfigType.CHANNEL],
    },
    choice: {
      name: "Choix",
      description: "Une valeur parmi un ensemble fixe (select mono-choix).",
      type: ConfigType.ENUM,
      options: ["faible", "moyen", "élevé"] as const,
      defaultValue: "moyen",
    },
    choiceList: {
      name: "Choix multiples",
      description: "Plusieurs valeurs parmi un ensemble fixe (multi-select).",
      type: [ConfigType.ENUM],
      options: ["nord", "sud", "est", "ouest"] as const,
    },
  },

  onLoad() {
    logger.info("Module Test Config chargé (mode développement)");
  },

  onInstall(_client, guild) {
    logger.info(`Module Test Config activé sur le serveur ${guild.id}`);
  },

  onUninstall(_client, guild) {
    logger.info(`Module Test Config désactivé sur le serveur ${guild.id}`);
  },
});
