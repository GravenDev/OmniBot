import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from "discord.js";
import configService from "#core/services/config.service.js";
import { replyWithCoreT } from "#core/utils/core-config.js";
import {
  ConfigType,
  ConfigValidator,
  type ConfigProvider,
  type ConfigSchema,
} from "#lib/config.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import type { Module } from "#lib/module.js";
import type { Registry } from "#lib/registry.js";
import { resolveConfigurableModule, saveConfigValue } from "./config-edit.js";
import { ConfigTypeHandler } from "./config-handler.js";

export default class NumberConfigHandler extends ConfigTypeHandler<ConfigType.NUMBER> {
  constructor() {
    super(ConfigType.NUMBER);
  }

  public override async replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    config: ConfigProvider<TSchema>,
    key: keyof TSchema,
    _sourceMessageId: string
  ): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(`set-config-number-modal:${module.id}:${key.toString()}`)
      .setTitle(config.t("setConfig.title", { key: key.toString() }))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel(config.t("setConfig.label", { type: "number" }))
            .setValue((config.get(key) ?? "").toString())
            .setStyle(TextInputStyle.Short)
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
  customId: "set-config-number-modal",
  requiresAdmin: true,
  check: (interaction) => interaction.isModalSubmit(),
  execute: async (interaction, [moduleId, configKey]) => {
    const module = resolveConfigurableModule(moduleId);

    if (!module || !configService.isConfigKey(module, configKey)) {
      await replyWithCoreT(interaction, "interaction.configOptionNotFound");
      return;
    }

    const raw = interaction.fields.getTextInputValue("value");

    if (!ConfigValidator[ConfigType.NUMBER](raw)) {
      const config = await configService.getConfigForModuleIn(
        module,
        interaction.guildId!
      );
      await interaction.reply({
        content: config.t("config.number.invalid", { value: raw }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const components = await saveConfigValue(
      module,
      interaction.guildId!,
      configKey,
      Number(raw)
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
