import { GatewayIntentBits } from "discord.js";
import logger from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import messageCreateListener from "./listeners/message-create.listener.js";
import { threadCreatorConfigSchema } from "./thread-creator.config.js";

export default defineModule({
  id: "thread-creator",
  name: "Thread Creator",
  description:
    "Automatically creates discussion threads under each new message in configured channels. Replaces Needle bot.",
  version: "2.1.0",
  author: "AsyncMod Team",

  // Configuration éditée via /config thread-creator.
  config: threadCreatorConfigSchema,

  // Intents requis pour surveiller les messages
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  onLoad(_client, registry) {
    registry.register(messageCreateListener);

    logger.info("Module Thread Creator chargé avec succès");
  },

  onInstall(_client, guild) {
    logger.info(
      `Module Thread Creator installé sur le serveur "${guild.name}" (${guild.id})`
    );
  },

  onUninstall(_client, guild) {
    logger.info(
      `Module Thread Creator désinstallé du serveur "${guild.name}" (${guild.id})`
    );
  },
});
