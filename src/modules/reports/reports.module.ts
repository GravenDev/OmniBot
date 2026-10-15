import { GatewayIntentBits, Partials } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import reportMessageCommand from "./commands/report-message.command.js";
import {
  alertButtonHandlers,
  alertModalHandlers,
} from "./interactions/alert-actions.js";
import reportMenuModal from "./interactions/report-menu.modal.js";
import {
  messageDeleteBulkListener,
  messageDeleteListener,
  messageUpdateListener,
} from "./listeners/message-changes.listener.js";
import reactionAddListener from "./listeners/reaction-add.listener.js";
import { reportsConfigSchema } from "./reports.config.js";
import { reportsTasks } from "./tasks.js";

const logger = loggerMaker("reports");

const reportsModule = defineModule({
  id: "reports",
  name: "Reports",
  description:
    "Lets members report a message with a reaction or the context menu; moderators get an alert with actions.",
  version: "1.0.0",
  author: "OmniBot",

  config: reportsConfigSchema,

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],

  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],

  onLoad(_client, registry) {
    registry.register(reportMessageCommand);
    registry.register(reportMenuModal);
    registry.register(reactionAddListener);
    registry.register(messageUpdateListener);
    registry.register(messageDeleteListener);
    registry.register(messageDeleteBulkListener);
    for (const handler of alertButtonHandlers) {
      registry.register(handler);
    }
    for (const handler of alertModalHandlers) {
      registry.register(handler);
    }
    for (const task of reportsTasks(reportsModule)) {
      registry.register(task);
    }
  },

  onInstall(_client, guild) {
    logger.info(`Module installed | guildId = ${guild.id}`);
  },

  onUninstall(_client, guild) {
    logger.info(`Module uninstalled | guildId = ${guild.id}`);
  },
});

export default reportsModule;
