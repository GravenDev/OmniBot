import { MessageFlags, type ButtonInteraction } from "discord.js";
import { modules } from "#core/runtime.js";
import { getCoreT } from "#core/utils/core-config.js";
import { disableAndRefresh } from "#core/utils/disable-module.js";
import { modulesPanel } from "#core/utils/modules-panel.js";
import type { TFunction } from "#lib/i18n.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import type { Module } from "#lib/module.js";

async function moduleOf(
  interaction: ButtonInteraction,
  moduleId: string | undefined,
  coreT: TFunction
): Promise<Module | null> {
  const module = moduleId && modules.find((mod) => mod.id === moduleId);
  if (!module) {
    await interaction.reply({
      content: coreT(
        moduleId ? "interaction.moduleNotFound" : "interaction.malformed"
      ),
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return module;
}

/** Disables the module once the administrator confirmed its warning. */
export const disableModuleConfirmButton = declareInteractionHandler({
  customId: "disable-module-confirm",
  access: "admin",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId]) {
    const coreT = await getCoreT(interaction.guildId!);
    const module = await moduleOf(interaction, moduleId, coreT);
    if (module) {
      await disableAndRefresh(interaction, module, coreT);
    }
  },
});

/** Back to the `/modules` panel, the module still enabled. */
export const disableModuleCancelButton = declareInteractionHandler({
  customId: "disable-module-cancel",
  access: "admin",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId]) {
    const coreT = await getCoreT(interaction.guildId!);
    await interaction.update({
      components: [
        await modulesPanel(interaction.guildId!, coreT, moduleId ?? 0),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
