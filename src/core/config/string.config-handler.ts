import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import { ConfigProvider, ConfigType, type ConfigSchema } from "#lib/config.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import type { Module } from "#lib/module.js";
import type { Registry } from "#lib/registry.js";
import { resolveConfigurableModule, saveConfigValue } from "./config-edit.js";
import { ConfigTypeHandler } from "./config-handler.js";

export default class StringConfigHandler extends ConfigTypeHandler<ConfigType.STRING> {
  constructor() {
    super(ConfigType.STRING);
  }

  public override async replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    config: ConfigProvider<TSchema>,
    key: string,
    _sourceMessageId: string
  ): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(`set-string-config-modal:${module.id}:${key}`)
      .setTitle(config.t("setConfig.title", { key }))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel(config.t("setConfig.label", { type: "text" }))
            .setStyle(TextInputStyle.Short)
            .setValue((config.get(key) ?? "").toString())
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
  }

  public override async registerEditionInteractionHandlers(
    registry: Registry
  ): Promise<void> {
    registry.register(handleModalSubmit);
  }
}

const handleModalSubmit = declareInteractionHandler({
  customId: "set-string-config-modal",
  requiresAdmin: true,
  check: (interaction) => interaction.isModalSubmit(),
  execute: async (interaction, [moduleId, configKey]) => {
    const module = resolveConfigurableModule(moduleId);

    if (!module || !configService.isConfigKey(module, configKey)) {
      const coreConfig = await configService.getConfigForModuleIn(
        coreModule,
        interaction.guildId!
      );
      await interaction.reply({
        content: coreConfig.t("interaction.configOptionNotFound"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const value = interaction.fields.getTextInputValue("value");

    const components = await saveConfigValue(
      module,
      interaction.guildId!,
      configKey,
      value
    );

    if (interaction.isFromMessage()) {
      await interaction.update({
        components,
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      await interaction.reply({
        components,
        flags: MessageFlags.Ephemeral + MessageFlags.IsComponentsV2,
      });
    }
  },
});
