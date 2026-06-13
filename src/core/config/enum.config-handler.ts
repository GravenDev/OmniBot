import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  ConfigType,
  isEnumEntry,
  type ConfigProvider,
  type ConfigSchema,
} from "../../lib/config.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
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

/** Discord caps a string select menu at 25 options. */
const MAX_SELECT_OPTIONS = 25;

/** Normalizes a (possibly list) enum config value to an array of string values. */
function currentEnumValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return value === null || value === undefined ? [] : [String(value)];
}

/** Reads the options declared on an enum config key (empty if not an enum). */
function optionsFor(module: Module, key: string): string[] {
  const entry = getConfigEntry(module, key);
  return isEnumEntry(entry) ? [...entry.options] : [];
}

/**
 * Handler for {@link ConfigType.ENUM} fields: a value (or list of values) chosen
 * from a fixed set declared on the entry as `options`. Edited via a native
 * string select menu — single-select for a scalar enum, multi-select for a
 * `ListOf<ENUM>`. Mirrors {@link EntitySelectConfigHandler}'s ephemeral-editor
 * flow (the select stays open on its own message; the public config message is
 * refreshed separately).
 */
export default class EnumConfigHandler extends ConfigTypeHandler<ConfigType.ENUM> {
  private readonly selectCustomId = "set-enum-config";

  constructor() {
    super(ConfigType.ENUM);
  }

  /** Builds the ephemeral select-menu editor, pre-selecting the current value(s). */
  private buildEditorContainer(
    module: Module,
    key: string,
    current: string[],
    sourceMessageId: string
  ): ContainerBuilder {
    const options = optionsFor(module, key).slice(0, MAX_SELECT_OPTIONS);
    const isList = isListEntry(getConfigEntry(module, key));
    const customId = `${this.selectCustomId}:${module.id}:${key}:${sourceMessageId}`;

    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(
        isList
          ? "Sélectionnez une ou plusieurs valeurs"
          : "Sélectionnez une valeur"
      )
      .setMinValues(isList ? 0 : 1)
      .setMaxValues(isList ? Math.max(options.length, 1) : 1)
      .addOptions(
        options.map((option) => ({
          label: option,
          value: option,
          default: current.includes(option),
        }))
      );

    return new ContainerBuilder().addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
    );
  }

  public override async replyToEditRequest<TSchema extends ConfigSchema>(
    interaction: ButtonInteraction,
    module: Module<TSchema>,
    config: ConfigProvider<TSchema>,
    key: keyof TSchema,
    sourceMessageId: string
  ): Promise<void> {
    await interaction.reply({
      components: [
        this.buildEditorContainer(
          module,
          String(key),
          currentEnumValues(config.get(key)),
          sourceMessageId
        ),
      ],
      flags: MessageFlags.Ephemeral + MessageFlags.IsComponentsV2,
    });
  }

  public override async registerEditionInteractionHandlers(
    registry: Registry
  ): Promise<void> {
    const buildEditorContainer = this.buildEditorContainer.bind(this);

    registry.register(
      declareInteractionHandler<StringSelectMenuInteraction>({
        customId: this.selectCustomId,
        requiresAdmin: true,
        check: (interaction): interaction is StringSelectMenuInteraction =>
          interaction.isStringSelectMenu(),
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

          const allowed = new Set(optionsFor(module, configKey));
          const selected = interaction.values;
          if (!selected.every((value) => allowed.has(value))) {
            await interaction.reply({
              content: "Valeur sélectionnée invalide.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const isList = isListEntry(getConfigEntry(module, configKey));
          const value = isList ? selected : (selected[0] ?? null);

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
              buildEditorContainer(
                module,
                configKey,
                selected,
                sourceMessageId!
              ),
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
