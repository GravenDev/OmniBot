import { GatewayIntentBits, Partials } from "discord.js";
import { loggerMaker } from "#lib/logger.js";
import { defineModule } from "#lib/module.js";
import jd4hAdminCommand from "./commands/jd4h-admin.command.js";
import jd4hCommand from "./commands/jd4h.command.js";
import { fourHourGameConfigSchema } from "./four-hour-game.config.js";
import messageCreateListener from "./listeners/message-create.listener.js";
import messageDeleteBulkListener from "./listeners/message-delete-bulk.listener.js";
import messageDeleteListener from "./listeners/message-delete.listener.js";
import fourHourGameService from "./services/four-hour-game.service.js";
import { syncAllRounds } from "./services/round-sync.js";

const logger = loggerMaker("four-hour-game");

const fourHourGameModule = defineModule({
  id: "four-hour-game",
  name: "4h Game",
  description:
    "Score a point when your message stays the last one in the game channel for the configured delay.",
  version: "1.0.0",
  author: "LoicR",

  config: fourHourGameConfigSchema,

  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],

  partials: [Partials.Message],

  onLoad(_client, registry) {
    registry.register(messageCreateListener);
    registry.register(messageDeleteListener);
    registry.register(messageDeleteBulkListener);
    registry.register(jd4hCommand);
    registry.register(jd4hAdminCommand);

    syncAllRounds(fourHourGameModule).catch((err: unknown) =>
      logger.error({ err }, "Failed to sync rounds at startup")
    );
  },

  onInstall(_client, guild) {
    logger.info(`Module installed | guildId = ${guild.id}`);
    fourHourGameService
      .resetRound(guild.id)
      .catch((err: unknown) =>
        logger.error({ err }, `Failed to reset round | guildId = ${guild.id}`)
      );
  },

  onUninstall(_client, guild) {
    logger.info(`Module uninstalled | guildId = ${guild.id}`);
  },
});

export default fourHourGameModule;
