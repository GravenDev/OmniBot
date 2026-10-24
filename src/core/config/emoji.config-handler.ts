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
  fetchGuildEmojis,
  resolveEmoji,
  type ConfigProvider,
  type ConfigSchema,
} from "#lib/config.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import type { Module } from "#lib/module.js";
import type { Registry } from "#lib/registry.js";
import { resolveConfigurableModule, saveConfigValue } from "./config-edit.js";
import { ConfigTypeHandler } from "./config-handler.js";

export default class EmojiConfigHandler extends ConfigTypeHandler<ConfigType.EMOJI> {
  constructor() {
    super(ConfigType.EMOJI);
  }

  public override async replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    config: ConfigProvider<TSchema>,
    key: keyof TSchema,
    _sourceMessageId: string
  ): Promise<void> {
    const current = config.get(key);

    const modal = new ModalBuilder()
      .setCustomId(`set-config-emoji-modal:${module.id}:${key.toString()}`)
      .setTitle(config.t("setConfig.title", { key: key.toString() }))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel(
              config.t("setConfig.label", { type: config.t("type.emoji") })
            )
            .setPlaceholder(config.t("config.emoji.placeholder"))
            .setValue(typeof current === "string" ? current : "")
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
  customId: "set-config-emoji-modal",
  access: "admin",
  check: (interaction) => interaction.isModalSubmit(),
  execute: async (interaction, [moduleId, configKey]) => {
    const module = resolveConfigurableModule(moduleId);

    if (!module || !configService.isConfigKey(module, configKey)) {
      await replyWithCoreT(interaction, "interaction.configOptionNotFound");
      return;
    }

    const typed = interaction.fields.getTextInputValue("value").trim();
    const value = resolveEmoji(
      typed,
      await fetchGuildEmojis(interaction.guild)
    );

    if (!value) {
      const config = await configService.getConfigForModuleIn(
        module,
        interaction.guildId!
      );
      await interaction.reply({
        content: config.t("config.emoji.invalid", { value: typed }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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
