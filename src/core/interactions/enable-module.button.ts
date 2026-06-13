import { MessageFlags } from "discord.js";
import { modules } from "../../index.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import { installModule } from "../loaders/module-installer.js";
import moduleService from "../services/module.service.js";
import { modulesMessage } from "../utils/core-messages.js";

export default declareInteractionHandler({
  customId: "enable-module",
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
      await installModule(module, interaction.guild!);
    } catch {
      await interaction.followUp({
        content: "Failed to enable the module. Please try again later.",
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
