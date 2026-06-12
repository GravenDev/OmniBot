import {
  ActionRowBuilder,
  ButtonInteraction,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { modules } from "../../index.js";
import {
  ConfigProvider,
  ConfigType,
  type ConfigSchema,
} from "../../lib/config.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import type { Module } from "../../lib/module.js";
import type { Registry } from "../../lib/registry.js";
import coreModule from "../core.module.js";
import configService from "../services/config.service.js";
import { configurationMessage } from "../utils/core.messages.js";
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

  public override editionSection<TSchema extends ConfigSchema>(
    _module: Module<TSchema>,
    _configuration: ConfigProvider<TSchema>,
    _key: keyof TSchema
  ): Promise<ContainerBuilder> {
    throw new Error("Method not implemented.");
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
  execute: async (interaction, args, _config) => {
    const [moduleId, configKey] = args;

    const module = [...modules, coreModule].find((m) => m.id === moduleId);
    if (!module) {
      await interaction.reply({
        content: "Module not found.",
        ephemeral: true,
      });
      return;
    }

    if (!configService.isConfigKey(module, configKey)) {
      await interaction.reply({
        content: "Configuration key not found.",
        ephemeral: true,
      });
      return;
    }

    const value = interaction.fields.getTextInputValue("value");

    await configService.updateConfigForModuleIn(module, interaction.guildId!, {
      [configKey]: value,
    });

    await interaction.reply({
      components: await configurationMessage(
        module,
        await configService.getConfigForModuleIn(module, interaction.guildId!)
      ),
      flags: MessageFlags.Ephemeral + MessageFlags.IsComponentsV2,
    });
  },
});
