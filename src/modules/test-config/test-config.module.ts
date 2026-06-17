import { ConfigType } from "#lib/config.js";
import logger from "#lib/logger.js";
import { defineModule } from "#lib/module.js";

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
    "Development module declaring all configuration types, used to test the configuration UI.",
  version: "1.0.0",
  author: "OmniBot",
  devOnly: true,

  config: {
    text: {
      name: "Text",
      description: "A free text field.",
      type: ConfigType.STRING,
      defaultValue: "valeur par défaut",
    },
    number: {
      name: "Number",
      description: "A numeric field.",
      type: ConfigType.NUMBER,
      defaultValue: 42,
    },
    toggle: {
      name: "Boolean",
      description: "An on/off toggle.",
      type: ConfigType.BOOLEAN,
      defaultValue: false,
    },
    user: {
      name: "User",
      description: "A Discord user.",
      type: ConfigType.USER,
    },
    role: {
      name: "Role",
      description: "A Discord role.",
      type: ConfigType.ROLE,
    },
    channel: {
      name: "Channel",
      description: "A Discord channel.",
      type: ConfigType.CHANNEL,
    },
    category: {
      name: "Category",
      description: "A Discord category.",
      type: ConfigType.CATEGORY,
    },
    textList: {
      name: "Text list",
      description: "A list of strings (add/remove editor).",
      type: [ConfigType.STRING],
      defaultValue: ["alpha", "beta"],
    },
    numberList: {
      name: "Number list",
      description: "A list of numbers (add/remove editor).",
      type: [ConfigType.NUMBER],
    },
    boolList: {
      name: "Boolean list",
      description: "A list of booleans (add/remove editor).",
      type: [ConfigType.BOOLEAN],
      defaultValue: [true, false],
    },
    roleList: {
      name: "Role list",
      description: "Multiple Discord roles (multi-select).",
      type: [ConfigType.ROLE],
    },
    channelList: {
      name: "Channel list",
      description: "Multiple Discord channels (multi-select).",
      type: [ConfigType.CHANNEL],
    },
    choice: {
      name: "Choice",
      description: "A value from a fixed set (single-choice select).",
      type: ConfigType.ENUM,
      options: ["faible", "moyen", "élevé"] as const,
      defaultValue: "moyen",
    },
    choiceList: {
      name: "Multiple choice",
      description: "Multiple values from a fixed set (multi-select).",
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
