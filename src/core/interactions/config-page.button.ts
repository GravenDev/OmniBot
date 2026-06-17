import { MessageFlags } from "discord.js";
import { resolveConfigurableModule } from "#core/config/config-edit.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import { configurationMessage } from "#core/utils/core-messages.js";
import { declareInteractionHandler } from "#lib/interaction.js";

/**
 * Navigates between pages of the `/config` panel. The target page is encoded in
 * the customId (`config-page:<moduleId>:<page>`); the panel is re-rendered in
 * place at that page. Out-of-range pages are clamped by `configurationMessage`.
 */
export default declareInteractionHandler({
  customId: "config-page",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, pageRaw]) {
    const module = resolveConfigurableModule(moduleId);
    if (!module) {
      const coreConfig = await configService.getConfigForModuleIn(
        coreModule,
        interaction.guildId!
      );
      await interaction.reply({
        content: coreConfig.t("config.notFound"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const page = Number(pageRaw);
    const config = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );

    await interaction.update({
      components: configurationMessage(
        module,
        config,
        Number.isInteger(page) ? page : 0
      ),
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
