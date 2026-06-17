import { MessageFlags } from "discord.js";
import { installModule } from "#core/loaders/module-installer.js";
import moduleService from "#core/services/module.service.js";
import { getCoreT } from "#core/utils/core-config.js";
import { modulesMessage } from "#core/utils/core-messages.js";
import { modules } from "#index.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "enable-module",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  async execute(interaction, args) {
    const moduleId = args[0];
    const coreT = await getCoreT(interaction.guildId!);

    if (!moduleId) {
      await interaction.reply({
        content: coreT("interaction.malformed"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const module = modules.find((mod) => mod.id === moduleId);
    if (!module) {
      await interaction.reply({
        content: coreT("interaction.moduleNotFound"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const defer = await interaction.deferUpdate();

    try {
      await installModule(module, interaction.guild!);
    } catch {
      await interaction.followUp({
        content: coreT("interaction.failedEnable"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modulesState = await moduleService.getAllModulesStateIn(
      interaction.guildId!
    );

    await defer.edit({
      components: [modulesMessage(modulesState, coreT)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
