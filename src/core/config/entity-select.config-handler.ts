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
  getConfigEntry,
  isListEntry,
  refreshSourceConfigMessage,
  resolveConfigurableModule,
} from "./config-edit.js";
import { ConfigTypeHandler } from "./config-handler.js";

/** Maximum entries Discord allows a select menu to return. */
const MAX_SELECT_VALUES = 25;

/** Extracts entity ids from a (possibly list) deserialized config value. */
function currentEntityIds(value: unknown): string[] {
  const entities = Array.isArray(value) ? value : value ? [value] : [];
  return entities
    .map((entity) => (entity as { id?: string }).id)
    .filter((id): id is string => Boolean(id));
}

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

  /** Builds the select menu action row, pre-selecting the current value(s). */
  protected abstract buildSelectRow(
    customId: string,
    currentIds: string[],
    minValues: number,
    maxValues: number
  ): ActionRowBuilder<MessageActionRowComponentBuilder>;

  /** Narrows an interaction to the select menu kind handled here. */
  protected abstract isMatchingSelect(
    interaction: CompatibleInteraction
  ): interaction is AnySelectMenuInteraction;

  /** Builds the ephemeral select-menu editor container, pre-filled with current ids. */
  private buildEditorContainer(
    module: Module,
    key: string,
    currentIds: string[],
    sourceMessageId: string
  ): ContainerBuilder {
    const customId = `${this.selectCustomId}:${module.id}:${key}:${sourceMessageId}`;
    const isList = isListEntry(getConfigEntry(module, key));
    const row = this.buildSelectRow(
      customId,
      currentIds,
      isList ? 0 : 1,
      isList ? MAX_SELECT_VALUES : 1
    );

    return new ContainerBuilder().addActionRowComponents(row);
  }

  public override async replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    config: ConfigProvider<TSchema>,
    key: keyof TSchema,
    sourceMessageId: string
  ): Promise<void> {
    const container = this.buildEditorContainer(
      module,
      String(key),
      currentEntityIds(config.get(key)),
      sourceMessageId
    );

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
    const buildEditorContainer = this.buildEditorContainer.bind(this);

    registry.register(
      declareInteractionHandler<AnySelectMenuInteraction>({
        customId: this.selectCustomId,
        requiresAdmin: true,
        check: (interaction): interaction is AnySelectMenuInteraction =>
          isMatchingSelect(interaction),
        execute: async (
          interaction,
          [moduleId, configKey, sourceMessageId]
        ) => {
          const module = resolveConfigurableModule(moduleId);
          if (!module || !configService.isConfigKey(module, configKey)) {
            await interaction.reply({
              content: "Configuration introuvable.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const ids = interaction.values;
          if (!ids.every((id) => validate(id))) {
            await interaction.reply({
              content: "Valeur sélectionnée invalide.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const isList = isListEntry(getConfigEntry(module, configKey));
          const value = isList ? ids : (ids[0] ?? null);

          await configService.updateConfigForModuleIn(
            module,
            interaction.guildId!,
            { [configKey]: value }
          );

          // Keep the (ephemeral) select open with the new selection, and refresh
          // the public config message — never render a config view here, so its
          // edit buttons can't point at an ephemeral (uneditable) message.
          await interaction.update({
            components: [
              buildEditorContainer(module, configKey, ids, sourceMessageId!),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          await refreshSourceConfigMessage(
            interaction,
            module,
            sourceMessageId
          );
        },
      })
    );
  }
}
