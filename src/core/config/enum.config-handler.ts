import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { ConfigType, isEnumEntry } from "#lib/config.js";
import type { CompatibleInteraction } from "#lib/interaction.js";
import type { Module } from "#lib/module.js";
import { getConfigEntry } from "./config-edit.js";
import {
  MAX_SELECT_VALUES,
  SelectConfigHandler,
  type SelectRowContext,
} from "./select.config-handler.js";

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
 * from a fixed set declared on the entry as `options`, edited via a native
 * string select menu. The editor lifecycle and persistence are inherited from
 * {@link SelectConfigHandler}; this class only supplies the option-backed select
 * widget and option-membership validation.
 */
export default class EnumConfigHandler extends SelectConfigHandler<ConfigType.ENUM> {
  protected override readonly selectCustomId = "set-enum-config";

  constructor() {
    super(ConfigType.ENUM);
  }

  protected override currentValues(value: unknown): string[] {
    return currentEnumValues(value);
  }

  protected override isValidValue(
    value: string,
    module: Module,
    key: string
  ): boolean {
    return optionsFor(module, key).includes(value);
  }

  protected override maxSelectableValues(module: Module, key: string): number {
    return Math.min(optionsFor(module, key).length, MAX_SELECT_VALUES);
  }

  protected override editorUnavailableReason(
    module: Module,
    key: string
  ): string | null {
    return optionsFor(module, key).length === 0
      ? "Ce champ ne déclare aucune option."
      : null;
  }

  protected override buildSelectRow({
    module,
    key,
    customId,
    current,
    minValues,
    maxValues,
  }: SelectRowContext): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const options = optionsFor(module, key).slice(0, MAX_SELECT_VALUES);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(
        maxValues > 1
          ? "Sélectionnez une ou plusieurs valeurs"
          : "Sélectionnez une valeur"
      )
      .setMinValues(minValues)
      .setMaxValues(maxValues)
      .addOptions(
        options.map((option) => ({
          label: option,
          value: option,
          default: current.includes(option),
        }))
      );

    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      menu
    );
  }

  protected override isMatchingSelect(
    interaction: CompatibleInteraction
  ): interaction is AnySelectMenuInteraction {
    return interaction.isStringSelectMenu();
  }
}
