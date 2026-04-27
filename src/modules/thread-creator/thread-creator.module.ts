import { GatewayIntentBits } from "discord.js";
import logger from "../../lib/logger.js";
import { defineModule } from "../../lib/module.js";
// Import des composants du module
import threadConfigCommand from "./commands/thread-config.command.js";
import messageCreateListener from "./listeners/message-create.listener.js";

export default defineModule({
  id: "thread-creator",
  name: "Thread Creator",
  description:
    "Crée automatiquement des fils de discussion sous chaque nouveau message dans les canaux configurés. Remplace le bot Needle.",
  version: "1.0.0",
  author: "AsyncMod Team",

  // Intents requis pour surveiller les messages
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  // Chargement du module
  onLoad(_client, registry) {
    // Enregistrer les commandes
    registry.register(threadConfigCommand);

    // Enregistrer les listeners
    registry.register(messageCreateListener);

    logger.info("Module Thread Creator chargé avec succès");
  },

  // Installation du module sur un serveur
  onInstall(_client, guild, _registry) {
    logger.info(
      `Module Thread Creator installé sur le serveur "${guild.name}" (${guild.id})`
    );
  },

  // Désinstallation du module d'un serveur
  async onUninstall(_client, guild, _registry) {
    try {
      // Ici on pourrait nettoyer la configuration si besoin
      // Pour l'instant on garde la configuration au cas où le module serait réinstallé
      logger.info(
        `Module Thread Creator désinstallé du serveur "${guild.name}" (${guild.id})`
      );
    } catch (error) {
      logger.error(
        `Erreur lors de la désinstallation du module Thread Creator : ${error}`
      );
    }
  },
});
