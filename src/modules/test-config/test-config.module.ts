import { ConfigType } from "../../lib/config.js";
import logger from "../../lib/logger.js";
import { defineModule } from "../../lib/module.js";

/**
 * Development-only module exercising every configuration field type.
 *
 * It declares no commands or listeners — its sole purpose is to give
 * `/config test-config` a schema covering all {@link ConfigType} values so the
 * configuration UI (modals, toggle, entity select menus) can be exercised
 * end-to-end on a real Discord server. Loaded only in dev mode.
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
