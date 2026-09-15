import logger from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import imcCommand from "./commands/imc.command.js";

export default defineModule({
  id: "imc",
  name: "IMC",
  description:
    "Records members' BMI and shows a server leaderboard sorted by BMI (descending).",
  version: "1.0.0",
  author: "OmniBot",

  onLoad(_client, registry) {
    registry.register(imcCommand);

    logger.info("Module IMC chargé avec succès");
  },

  onInstall(_client, guild) {
    logger.info(
      `Module IMC installé sur le serveur "${guild.name}" (${guild.id})`
    );
  },

  onUninstall(_client, guild) {
    logger.info(
      `Module IMC désinstallé du serveur "${guild.name}" (${guild.id})`
    );
  },
});
