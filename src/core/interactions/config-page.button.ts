import { MessageFlags } from "discord.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import { resolveConfigurableModule } from "../config/config-edit.js";
import configService from "../services/config.service.js";
import { configurationMessage } from "../utils/core-messages.js";

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
      await interaction.reply({
        content: "Configuration introuvable.",
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
