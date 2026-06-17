import { MessageFlags } from "discord.js";
import coreModule from "#core/core.module.js";
import { installModule } from "#core/loaders/module-installer.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { modulesMessage } from "#core/utils/core-messages.js";
import { modules } from "#index.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "enable-module",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  async execute(interaction, args) {
    const moduleId = args[0];
    const coreConfig = await configService.getConfigForModuleIn(
      coreModule,
      interaction.guildId!
    );

    if (!moduleId) {
      await interaction.reply({
        content: coreConfig.t("interaction.malformed"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const module = modules.find((mod) => mod.id === moduleId);
    if (!module) {
      await interaction.reply({
        content: coreConfig.t("interaction.moduleNotFound"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const defer = await interaction.deferUpdate();

    try {
      await installModule(module, interaction.guild!);
    } catch {
      await interaction.followUp({
        content: coreConfig.t("interaction.failedEnable"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modulesState = await moduleService.getAllModulesStateIn(
      interaction.guildId!
    );

    await defer.edit({
      components: [modulesMessage(modulesState, coreConfig.t)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
