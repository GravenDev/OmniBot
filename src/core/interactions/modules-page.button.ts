import { MessageFlags } from "discord.js";
import { getCoreT } from "#core/utils/core-config.js";
import { modulesPanel } from "#core/utils/modules-panel.js";
import { declareInteractionHandler } from "#lib/interaction.js";

/**
 * Navigates between pages of the `/modules` panel. The target page is encoded
 * in the customId (`modules-page:<page>`); the panel is re-rendered in place at
 * that page. Out-of-range pages are clamped by `modulesMessage`.
 */
export default declareInteractionHandler({
  customId: "modules-page",
  access: "admin",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [pageRaw]) {
    const page = Number(pageRaw);
    const coreT = await getCoreT(interaction.guildId!);

    await interaction.update({
      components: [
        await modulesPanel(
          interaction.guildId!,
          coreT,
          Number.isInteger(page) ? page : 0
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
