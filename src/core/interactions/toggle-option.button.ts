import { MessageFlags } from "discord.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import { resolveConfigurableModule } from "../config/config-edit.helpers.js";
import configService from "../services/config.service.js";
import { configurationMessage } from "../utils/core.messages.js";

export default declareInteractionHandler({
  customId: "toggle-option",
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

    const currentValue = config.get(configKey);

    if (typeof currentValue !== "boolean") {
      await interaction.reply({
        content: "This option is not a boolean toggle.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const newConfig = await configService.updateConfigForModuleIn(
      module,
      interaction.guildId!,
      {
        [configKey]: !currentValue,
      }
    );

    await interaction.update({
      components: await configurationMessage(module, newConfig),
      flags: MessageFlags.IsComponentsV2 + MessageFlags.Ephemeral,
    });
  },
});
