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
  type ConfigProvider,
  type ConfigSchema,
} from "#lib/config.js";
import { formatDuration, parseDuration } from "#lib/duration.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import type { Module } from "#lib/module.js";
import type { Registry } from "#lib/registry.js";
import { resolveConfigurableModule, saveConfigValue } from "./config-edit.js";
import { ConfigTypeHandler } from "./config-handler.js";

export default class DurationConfigHandler extends ConfigTypeHandler<ConfigType.DURATION> {
  constructor() {
    super(ConfigType.DURATION);
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
      .setCustomId(`set-config-duration-modal:${module.id}:${key.toString()}`)
      .setTitle(config.t("setConfig.title", { key: key.toString() }))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel(
              config.t("setConfig.label", { type: config.t("type.duration") })
            )
            .setPlaceholder(config.t("config.duration.placeholder"))
            .setValue(
              typeof current === "number" ? formatDuration(current) : ""
            )
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
  customId: "set-config-duration-modal",
  access: "admin",
  check: (interaction) => interaction.isModalSubmit(),
  execute: async (interaction, [moduleId, configKey]) => {
    const module = resolveConfigurableModule(moduleId);

    if (!module || !configService.isConfigKey(module, configKey)) {
      await replyWithCoreT(interaction, "interaction.configOptionNotFound");
      return;
    }

    const raw = interaction.fields.getTextInputValue("value");
    const seconds = parseDuration(raw);

    if (seconds === null) {
      const config = await configService.getConfigForModuleIn(
        module,
        interaction.guildId!
      );
      await interaction.reply({
        content: config.t("config.duration.invalid", { value: raw }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const components = await saveConfigValue(
      module,
      interaction.guildId!,
      configKey,
      seconds
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
