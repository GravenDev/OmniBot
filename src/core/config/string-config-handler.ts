import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  ConfigProvider,
  ConfigType,
  type ConfigSchema,
} from "../../lib/config.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import type { Module } from "../../lib/module.js";
import type { Registry } from "../../lib/registry.js";
import configService from "../services/config.service.js";
import {
  resolveConfigurableModule,
  saveConfigValue,
} from "./config-edit.helpers.js";
import { ConfigTypeHandler } from "./config-type-handler.js";

export default class StringConfigHandler extends ConfigTypeHandler<ConfigType.STRING> {
  constructor() {
    super(ConfigType.STRING);
  }

  public override async replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    config: ConfigProvider<TSchema>,
    key: string
  ): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(`set-string-config-modal:${module.id}:${key}`)
      .setTitle(`Set ${key}`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel(`Enter a value (text):`)
            .setStyle(TextInputStyle.Short)
            .setValue(config.get(key).toString())
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
  check: (interaction) => interaction.isModalSubmit(),
  execute: async (interaction, [moduleId, configKey]) => {
    const module = resolveConfigurableModule(moduleId);
    if (!module || !configService.isConfigKey(module, configKey)) {
      await interaction.reply({
        content: "Configuration introuvable.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const value = interaction.fields.getTextInputValue("value");

    await interaction.reply({
      components: await saveConfigValue(
        module,
        interaction.guildId!,
        configKey,
        value
      ),
      flags: MessageFlags.Ephemeral + MessageFlags.IsComponentsV2,
    });
  },
});
