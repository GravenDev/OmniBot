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
export const MAX_SELECT_VALUES = 25;

/** Everything a subclass needs to build its select menu row for one edit. */
export interface SelectRowContext {
  module: Module;
  key: string;
  /** customId carrying the routing prefix, module id, key, and source message id. */
  customId: string;
  /** Currently-stored values (entity ids / option strings) to pre-select. */
  current: string[];
  minValues: number;
  maxValues: number;
}

/**
 * Base handler for config types edited through a select menu — Discord entities
 * (user/role/channel/category) or a fixed set of enum choices, single or list.
 *
 * It owns the shared editor lifecycle: building the ephemeral select container,
 * replying to the edit request, and the select-submit handler (validate →
 * persist → keep the select open with the new selection → refresh the public
 * panel). Subclasses only provide the select widget and how stored values are
 * read and validated.
 */
export abstract class SelectConfigHandler<
  Type extends ConfigType,
> extends ConfigTypeHandler<Type> {
  /** customId prefix routing the select submission back to this handler. */
  protected abstract readonly selectCustomId: string;

  /** Builds the select menu action row, pre-selecting the current value(s). */
  protected abstract buildSelectRow(
    ctx: SelectRowContext
  ): ActionRowBuilder<MessageActionRowComponentBuilder>;

  /** Narrows an interaction to the select menu kind handled here. */
  protected abstract isMatchingSelect(
    interaction: CompatibleInteraction
  ): interaction is AnySelectMenuInteraction;

  /** Reads the stored value as the array of select values (entity ids / option strings). */
  protected abstract currentValues(value: unknown): string[];

  /** Whether a submitted select value is acceptable for this module/key. */
  protected abstract isValidValue(
    value: string,
    module: Module,
    key: string
  ): boolean;

  /** Maximum number of values selectable for a list field. */
  protected maxSelectableValues(_module: Module, _key: string): number {
    return MAX_SELECT_VALUES;
  }

  /**
   * If non-null, the editor cannot be opened and this message is shown instead
   * (e.g. an enum that declares no options).
   */
  protected editorUnavailableReason(
    _module: Module,
    _key: string
  ): string | null {
    return null;
  }

  /** Builds the ephemeral select-menu editor container, pre-filled with current values. */
  private buildEditorContainer(
    module: Module,
    key: string,
    current: string[],
    sourceMessageId: string
  ): ContainerBuilder {
    const customId = `${this.selectCustomId}:${module.id}:${key}:${sourceMessageId}`;
    const isList = isListEntry(getConfigEntry(module, key));
    const row = this.buildSelectRow({
      module,
      key,
      customId,
      current,
      minValues: isList ? 0 : 1,
      maxValues: isList ? this.maxSelectableValues(module, key) : 1,
    });

    return new ContainerBuilder().addActionRowComponents(row);
  }

  public override async replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    config: ConfigProvider<TSchema>,
    key: keyof TSchema,
    sourceMessageId: string
  ): Promise<void> {
    const reason = this.editorUnavailableReason(module, String(key));
    if (reason) {
      await interaction.reply({
        content: reason,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const container = this.buildEditorContainer(
      module,
      String(key),
      this.currentValues(config.get(key)),
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
    const isValidValue = this.isValidValue.bind(this);
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

          const values = interaction.values;
          if (
            !values.every((value) => isValidValue(value, module, configKey))
          ) {
            await interaction.reply({
              content: "Valeur sélectionnée invalide.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const isList = isListEntry(getConfigEntry(module, configKey));
          const value = isList ? values : (values[0] ?? null);

          await configService.updateConfigForModuleIn(
            module,
            interaction.guildId!,
            { [configKey]: value }
          );

          // Keep the (ephemeral) select open with the new selection, then refresh
          // the public config message — never render a config view here, so its
          // edit buttons can't point at an ephemeral (uneditable) message.
          await interaction.update({
            components: [
              buildEditorContainer(module, configKey, values, sourceMessageId!),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          await refreshSourceConfigMessage(
            interaction,
            module,
            sourceMessageId,
            configKey
          );
        },
      })
    );
  }
}
