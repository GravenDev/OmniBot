import { MessageFlags } from "discord.js";
import { modules } from "../../index.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import configService from "../services/config.service.js";
import { configurationMessage } from "../utils/core.messages.js";

export default declareInteractionHandler({
  customId: "toggle-option",
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

    const currentValue = config.get(configKey);

    if (typeof currentValue !== "boolean") {
      await interaction.followUp({
        content: "This option is not a boolean toggle.",
        ephemeral: true,
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
