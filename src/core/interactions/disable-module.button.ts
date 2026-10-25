import { MessageFlags } from "discord.js";
import { uninstallModule } from "#core/loaders/module-installer.js";
import { modules } from "#core/runtime.js";
import { getCoreT } from "#core/utils/core-config.js";
import { errorMessageKey } from "#core/utils/error-message.js";
import { modulesPanel } from "#core/utils/modules-panel.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "disable-module",
  access: "admin",
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
      await uninstallModule(module, interaction.guild!);
    } catch (err) {
      await interaction.followUp({
        content: coreT(errorMessageKey(err, "interaction.failedDisable")),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await defer.edit({
      components: [await modulesPanel(interaction.guildId!, coreT, module.id)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
