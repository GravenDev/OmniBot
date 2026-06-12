import { MessageFlags } from "discord.js";
import { ConfigType, type ConfigEntry } from "../../lib/config.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import { resolveConfigurableModule } from "../config/config-edit.helpers.js";
import configHandlers from "../config/config-type-handlers.js";
import configService from "../services/config.service.js";

export default declareInteractionHandler({
  customId: "configure-module",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, configKey]) {
    const module = resolveConfigurableModule(moduleId);

    if (!module || !configService.isConfigKey(module, configKey)) {
      await interaction.reply({
        content: "Configuration option not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );

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
