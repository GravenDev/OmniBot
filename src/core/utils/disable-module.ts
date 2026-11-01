import { MessageFlags, type ButtonInteraction } from "discord.js";
import { uninstallModule } from "#core/loaders/module-installer.js";
import configService from "#core/services/config.service.js";
import { errorMessageKey } from "#core/utils/error-message.js";
import { modulesPanel } from "#core/utils/modules-panel.js";
import { createT, type TFunction } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";

const logger = loggerMaker("core");

/**
 * The module's warning before it is disabled on the guild, or null when it
 * declares none or nothing would be lost. A warning that cannot be computed
 * still asks for confirmation, with a generic text: never disable silently a
 * module that said it deletes data.
 */
export async function uninstallWarningOf(
  module: Module,
  guildId: string,
  coreT: TFunction
): Promise<string | null> {
  if (!module.uninstallWarning) {
    return null;
  }
  try {
    const locale = await configService.getLocaleForGuild(guildId);
    return await module.uninstallWarning(guildId, createT(locale, module.id));
  } catch (err) {
    logger.error(
      { err },
      `Uninstall warning failed | moduleId = ${module.id} | guildId = ${guildId}`
    );
    return coreT("modules.confirmDisableUnknown");
  }
}

/** Disables the module, then shows the `/modules` panel at its page. */
export async function disableAndRefresh(
  interaction: ButtonInteraction,
  module: Module,
  coreT: TFunction
): Promise<void> {
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
}
