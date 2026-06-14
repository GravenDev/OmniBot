import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
} from "discord.js";
import type moduleService from "#core/services/module.service.js";
import {
  ConfigType,
  getConfigTypeName,
  type ConfigProvider,
  type ConfigSchema,
  type ListOf,
} from "#lib/config.js";
import type { Module } from "#lib/module.js";
import { Colors } from "#utils/colors.js";

export const modulesMessage = (
  modulesState: Awaited<ReturnType<typeof moduleService.getAllModulesStateIn>>
) => {
  const container = new ContainerBuilder().setAccentColor(Colors.Turquoise);
  container.addTextDisplayComponents(
    (text) => text.setContent("# Modules"),
    (text) =>
      text.setContent(
        "The modules marked with ✅ are enabled, while those marked with ❌ are disabled."
      )
  );
  container.addSeparatorComponents((separator) => separator.setDivider(true));

  for (let state of modulesState) {
    const emoji = state.enabled ? "✅" : "❌";

    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(
            `${emoji} \`${state.module.name}\`${state.enabled ? ` (${state.enabledVersion})` : ""}\n> ${state.module.description}`
          )
        )
        .setButtonAccessory((button) =>
          button
            .setCustomId(
              state.enabled
                ? "disable-module:" + state.module.id
                : "enable-module:" + state.module.id
            )
            .setLabel(state.enabled ? "Disable" : "Enable")
            .setStyle(state.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        )
    );
  }

  return container;
};

/**
 * Renders a config value for display.
 *
 * Entity values (user/role/channel/category) stringify to mentions
 * (`<@&id>`, `<#id>`, …) which Discord only renders as names **outside** code
 * formatting, so they are shown bare; scalars stay in backticks. Lists are
 * joined; unset values show `—`.
 */
function renderCurrentValue(
  type: ConfigType | ListOf<ConfigType>,
  value: unknown
): string {
  const items = (Array.isArray(value) ? value : [value]).filter(
    (item) => item !== null && item !== undefined
  );
  if (items.length === 0) {
    return "—";
  }

  const baseType = Array.isArray(type) ? type[0] : type;
  const isEntity =
    baseType === ConfigType.USER ||
    baseType === ConfigType.ROLE ||
    baseType === ConfigType.CHANNEL ||
    baseType === ConfigType.CATEGORY;

  return items
    .map((item) => (isEntity ? String(item) : `\`${String(item)}\``))
    .join(", ");
}

/**
 * Fields rendered per page. Each field costs 3 components (section + text +
 * button) and the message-wide cap is 40, so a page is kept well under it,
 * leaving room for the header and the pagination row.
 */
export const CONFIG_FIELDS_PER_PAGE = 10;

/**
 * The page of the config panel that contains `key`, derived from its position
 * in the schema. Lets an edit re-render the page the field lives on instead of
 * snapping back to page 0 — no page state needs threading through customIds.
 */
export function configPageOfKey(module: Module, key: string): number {
  const index = Object.keys(module.config as ConfigSchema).indexOf(key);
  return index < 0 ? 0 : Math.floor(index / CONFIG_FIELDS_PER_PAGE);
}

export const configurationMessage = <TSchema extends ConfigSchema>(
  module: Module<TSchema>,
  config: ConfigProvider<TSchema>,
  page = 0
): ContainerBuilder[] => {
  const container = new ContainerBuilder().setAccentColor(Colors.Turquoise);

  const schema = config.schema;
  const keys = Object.keys(schema);
  const pageCount = Math.max(
    1,
    Math.ceil(keys.length / CONFIG_FIELDS_PER_PAGE)
  );
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);

  container.addTextDisplayComponents((text) =>
    text.setContent(
      `# \`${module.name}\` settings` +
        (pageCount > 1 ? `\n-# Page ${currentPage + 1}/${pageCount}` : "")
    )
  );
  container.addSeparatorComponents((separator) => separator.setDivider(true));

  const pageKeys = keys.slice(
    currentPage * CONFIG_FIELDS_PER_PAGE,
    currentPage * CONFIG_FIELDS_PER_PAGE + CONFIG_FIELDS_PER_PAGE
  );

  for (const key of pageKeys) {
    const option = schema[key];
    if (!option) continue;

    const value = config.get(key);
    const section = new SectionBuilder();
    section.addTextDisplayComponents((text) =>
      text.setContent(
        `-# ${getConfigTypeName(option.type)}\n**⚙️  ${option.name}**\n> ${option.description}\nCurrent: ${renderCurrentValue(option.type, value)}\n\n`
      )
    );

    if (option.type !== ConfigType.BOOLEAN) {
      section.setButtonAccessory((button) =>
        button
          .setCustomId(`configure-module:${module.id}:${key}`)
          .setEmoji({
            id: "1408086699720052776",
            name: "rename",
          })
          .setStyle(ButtonStyle.Primary)
      );
    } else {
      section.setButtonAccessory((button) =>
        button
          .setCustomId(`toggle-option:${module.id}:${key}`)
          .setEmoji({
            id: value ? "1410625083151618188" : "1410625093901484145",
            name: value ? "toggleon" : "toggleoff",
          })
          .setStyle(value ? ButtonStyle.Success : ButtonStyle.Danger)
      );
    }

    container.addSectionComponents(section);
  }

  if (keys.length === 0) {
    container.addTextDisplayComponents((text) =>
      text.setContent("-# Ce module n'a aucune configuration disponible.")
    );
  }

  // Pagination controls — shown only when the schema spans more than one page.
  // The target page is encoded in the customId so the handler can re-render.
  if (pageCount > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`config-page:${module.id}:${currentPage - 1}`)
          .setLabel("◀ Précédent")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`config-page:${module.id}:${currentPage + 1}`)
          .setLabel("Suivant ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === pageCount - 1)
      )
    );
  }

  return [container];
};
