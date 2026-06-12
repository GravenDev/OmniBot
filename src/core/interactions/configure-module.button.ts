import { modules } from "../../index.js";
import { ConfigType, type ConfigEntry } from "../../lib/config.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import configHandlers from "../config/config-type-handlers.js";
import configService from "../services/config.service.js";

export default declareInteractionHandler({
  customId: "configure-module",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, configKey]) {
    const module = modules.find((m) => m.id === moduleId)!;

    const config = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );

    if (!configService.isConfigKey(module, configKey)) {
      await interaction.followUp({
        content: "Configuration option not found.",
        ephemeral: true,
      });
      return;
    }

    const schemaDef = module.config[configKey] as ConfigEntry<any>;

    if (Array.isArray(schemaDef.type)) {
      return;
    }

    await configHandlers[schemaDef.type as ConfigType]?.replyToEditRequest(
      interaction,
      module,
      config,
      configKey
    );
  },
});
