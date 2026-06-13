import { MessageFlags } from "discord.js";
import { ConfigType } from "../../lib/config.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import {
  getConfigEntry,
  isScalarType,
  resolveConfigurableModule,
} from "../config/config-edit.helpers.js";
import configHandlers from "../config/config-type-handlers.js";
import { openScalarListEditor } from "../config/scalar-list-editor.js";
import configService from "../services/config.service.js";

export default declareInteractionHandler({
  customId: "configure-module",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, configKey]) {
    const module = resolveConfigurableModule(moduleId);

    if (!module || !configService.isConfigKey(module, configKey)) {
      await interaction.reply({
        content: "Configuration option not found.",
        flags: MessageFlags.Ephemeral,
      });
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
        (config.get(configKey) as unknown[] | undefined) ?? []
      );
      return;
    }

    await configHandlers[baseType]?.replyToEditRequest(
      interaction,
      module,
      config,
      configKey
    );
  },
});
