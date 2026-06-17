import {
  getConfigEntry,
  isScalarType,
  resolveConfigurableModule,
} from "#core/config/config-edit.js";
import configHandlers from "#core/config/config-handler-registry.js";
import { openScalarListEditor } from "#core/config/scalar-list-editor.js";
import configService from "#core/services/config.service.js";
import { replyWithCoreT } from "#core/utils/core-config.js";
import { ConfigType } from "#lib/config.js";
import { declareInteractionHandler } from "#lib/interaction.js";

export default declareInteractionHandler({
  customId: "configure-module",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, configKey]) {
    const module = resolveConfigurableModule(moduleId);

    if (!module || !configService.isConfigKey(module, configKey)) {
      await replyWithCoreT(interaction, "interaction.configOptionNotFound");
      return;
    }

    const config = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );

    const entry = getConfigEntry(module, configKey)!;
    const type = entry.type;
    const isList = Array.isArray(type);
    const baseType: ConfigType = Array.isArray(type) ? type[0] : type;

    // Scalar lists (text/number/boolean) get the dedicated add/remove editor;
    // everything else (scalars + entity lists) is handled by its type handler.
    if (isList && isScalarType(baseType)) {
      await openScalarListEditor(
        interaction,
        module,
        configKey,
        (config.get(configKey) as unknown[] | undefined) ?? [],
        interaction.message.id
      );
      return;
    }

    await configHandlers[baseType]?.replyToEditRequest(
      interaction,
      module,
      config,
      configKey,
      interaction.message.id
    );
  },
});
