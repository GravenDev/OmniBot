import { MessageFlags } from "discord.js";
import { uninstallModule } from "#core/loaders/module-installer.js";
import moduleService from "#core/services/module.service.js";
import { modulesMessage } from "#core/utils/core-messages.js";
import { modules } from "#index.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "disable-module",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  async execute(interaction, args) {
    const moduleId = args[0];
    if (!moduleId) {
      await interaction.reply({
        content: "The button is malformed. Please try again later.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const module = modules.find((mod) => mod.id === moduleId);
    if (!module) {
      await interaction.reply({
        content: "Module not found. Please try again later.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const defer = await interaction.deferUpdate();

    try {
      await uninstallModule(module, interaction.guild!);
    } catch {
      await interaction.followUp({
        content: "Failed to disable the module. Please try again later.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modulesState = await moduleService.getAllModulesStateIn(
      interaction.guildId!
    );

    await defer.edit({
      components: [modulesMessage(modulesState)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
