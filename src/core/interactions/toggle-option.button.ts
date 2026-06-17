import { MessageFlags } from "discord.js";
import { resolveConfigurableModule } from "#core/config/config-edit.js";
import configService from "#core/services/config.service.js";
import { replyWithCoreT } from "#core/utils/core-config.js";
import {
  configPageOfKey,
  configurationMessage,
} from "#core/utils/core-messages.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "toggle-option",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, configKey]) {
    const module = resolveConfigurableModule(moduleId);

    if (!module || !configService.isConfigKey(module, configKey)) {
      await replyWithCoreT(interaction, "interaction.configOptionNotFound");
      return;
    }

    const config = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );

    const currentValue = config.get(configKey);

    if (typeof currentValue !== "boolean") {
      await interaction.reply({
        content: config.t("interaction.notBoolean"),
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
      components: await configurationMessage(
        module,
        newConfig,
        configPageOfKey(module, configKey)
      ),
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
