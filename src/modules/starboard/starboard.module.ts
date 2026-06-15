import { GatewayIntentBits } from "discord.js";
import logger from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import messageReactionAddListener from "./listeners/message-reaction-add.listener.js";
import messageReactionRemoveListener from "./listeners/message-reaction-remove.listener.js";
import { starboardConfigSchema } from "./starboard.config.js";

export default defineModule({
  id: "starboard",
  name: "Starboard",
  description:
    "Reposte les messages populaires dans un salon dédié quand ils reçoivent assez de réactions. Supporte plusieurs émojis (dont customs), configuration par seuil, auto-star, et salons surveillés.",
  version: "1.0.0",
  author: "AsyncMod Team",

  config: starboardConfigSchema,

  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],

  onLoad(_client, registry) {
    registry.register(messageReactionAddListener);
    registry.register(messageReactionRemoveListener);

    logger.info("Module Starboard chargé avec succès");
  },

  onInstall(_client, guild) {
    logger.info(
      `Module Starboard installé sur le serveur "${guild.name}" (${guild.id})`
    );
  },

  onUninstall(_client, guild) {
    logger.info(
      `Module Starboard désinstallé du serveur "${guild.name}" (${guild.id})`
    );
  },
});
