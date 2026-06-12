import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type {
  ConfigProvider,
  ConfigSchema,
  ConfigType,
} from "../../lib/config.js";
import {
  declareInteractionHandler,
  type CompatibleInteraction,
} from "../../lib/interaction.js";
import type { Module } from "../../lib/module.js";
import type { Registry } from "../../lib/registry.js";
import configService from "../services/config.service.js";
import {
  resolveConfigurableModule,
  saveConfigValue,
} from "./config-edit.helpers.js";
import { ConfigTypeHandler } from "./config-type-handler.js";

/**
 * Base handler for Discord entity config types (user, role, channel, category)
 * edited through a native select menu. Subclasses only provide the select menu
 * builder and the matching interaction type guard.
 */
export abstract class EntitySelectConfigHandler<
  Type extends ConfigType,
> extends ConfigTypeHandler<Type> {
  /** customId prefix routing the select submission back to this handler. */
  protected abstract readonly selectCustomId: string;

  /** Builds the select menu action row, pre-selecting the current value. */
  protected abstract buildSelectRow(
    customId: string,
    currentId: string | undefined
  ): ActionRowBuilder<MessageActionRowComponentBuilder>;

  /** Narrows an interaction to the select menu kind handled here. */
  protected abstract isMatchingSelect(
    interaction: CompatibleInteraction
  ): interaction is AnySelectMenuInteraction;

  public override async replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    config: ConfigProvider<TSchema>,
    key: keyof TSchema
  ): Promise<void> {
    const customId = `${this.selectCustomId}:${module.id}:${String(key)}`;
    const current = config.get(key) as { id?: string } | null | undefined;
    const row = this.buildSelectRow(customId, current?.id);

    const container = new ContainerBuilder().addActionRowComponents(row);

    await interaction.reply({
      components: [container],
      flags: MessageFlags.Ephemeral + MessageFlags.IsComponentsV2,
    });
  }

  public override async registerEditionInteractionHandlers(
    registry: Registry
  ): Promise<void> {
    const isMatchingSelect = this.isMatchingSelect.bind(this);
    const validate = this.validate.bind(this);

    registry.register(
      declareInteractionHandler<AnySelectMenuInteraction>({
        customId: this.selectCustomId,
        check: (interaction): interaction is AnySelectMenuInteraction =>
          isMatchingSelect(interaction),
        execute: async (interaction, [moduleId, configKey]) => {
          const module = resolveConfigurableModule(moduleId);
          if (!module || !configService.isConfigKey(module, configKey)) {
            await interaction.reply({
              content: "Configuration introuvable.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const value = interaction.values[0] ?? null;
          if (value !== null && !validate(value)) {
            await interaction.reply({
              content: "Valeur sélectionnée invalide.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await interaction.update({
            components: await saveConfigValue(
              module,
              interaction.guildId!,
              configKey,
              value
            ),
            flags: MessageFlags.IsComponentsV2,
          });
        },
      })
    );
  }
}
