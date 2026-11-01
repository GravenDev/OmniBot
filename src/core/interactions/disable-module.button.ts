import { MessageFlags } from "discord.js";
import { modules } from "#core/runtime.js";
import { getCoreT } from "#core/utils/core-config.js";
import { disableConfirmationMessage } from "#core/utils/core-messages.js";
import {
  disableAndRefresh,
  uninstallWarningOf,
} from "#core/utils/disable-module.js";
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

    // A module that would delete data asks first: the panel gives way to the
    // warning, in the same ephemeral message.
    const warning = await uninstallWarningOf(
      module,
      interaction.guildId!,
      coreT
    );
    if (warning !== null) {
      const moduleName = coreT("modules." + module.id + ".name", {
        defaultValue: module.name,
      });
      await interaction.update({
        components: [
          disableConfirmationMessage(module.id, moduleName, warning, coreT),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    await disableAndRefresh(interaction, module, coreT);
  },
});
