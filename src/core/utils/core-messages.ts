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
  formatConfigValue,
  getConfigTypeName,
  type ConfigEntry,
  type ConfigProvider,
  type ConfigSchema,
} from "#lib/config.js";
import type { TFunction } from "#lib/i18n.js";
import type { Module } from "#lib/module.js";
import { Colors } from "#utils/colors.js";

export const modulesMessage = (
  modulesState: Awaited<ReturnType<typeof moduleService.getAllModulesStateIn>>,
  t: TFunction
) => {
  const container = new ContainerBuilder().setAccentColor(Colors.Turquoise);
  container.addTextDisplayComponents(
    (text) => text.setContent(t("modules.title")),
    (text) => text.setContent(t("modules.description"))
  );
  container.addSeparatorComponents((separator) => separator.setDivider(true));

  for (let state of modulesState) {
    const emoji = state.enabled ? "✅" : "❌";

    const modName = t("modules." + state.module.id + ".name", {
      defaultValue: state.module.name,
    });
    const modDesc = t("modules." + state.module.id + ".description", {
      defaultValue: state.module.description,
    });
    const versionSuffix = state.enabled ? ` (${state.enabledVersion})` : "";
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(
            t("modules.item", {
              emoji,
              moduleName: modName,
              version: versionSuffix,
              description: modDesc,
            })
          )
        )
        .setButtonAccessory((button) =>
          button
            .setCustomId(
              state.enabled
                ? "disable-module:" + state.module.id
                : "enable-module:" + state.module.id
            )
            .setLabel(
              state.enabled ? t("modules.disable") : t("modules.enable")
            )
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
  option: ConfigEntry<ConfigType>,
  value: unknown,
  locale: string
): string {
  const items = (Array.isArray(value) ? value : [value]).filter(
    (item) => item !== null && item !== undefined
  );
  if (items.length === 0) {
    return "—";
  }

  const type = option.type;
  const baseType = Array.isArray(type) ? type[0] : type;
  const isEntity =
    baseType === ConfigType.USER ||
    baseType === ConfigType.ROLE ||
    baseType === ConfigType.CHANNEL ||
    baseType === ConfigType.CATEGORY;

  return items
    .map((item) =>
      isEntity ? String(item) : `\`${formatConfigValue(option, item, locale)}\``
    )
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

  const modName = config.t("modules." + module.id + ".name", {
    defaultValue: module.name,
  });
  let header = config.t("config.header", { moduleName: modName });
  if (pageCount > 1) {
    header +=
      "\n" +
      config.t("config.page", { current: currentPage + 1, total: pageCount });
  }
  container.addTextDisplayComponents((text) => text.setContent(header));
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
    const optName = config.t("config." + key + ".name", {
      defaultValue: option.name,
    });
    const optDesc = config.t("config." + key + ".description", {
      defaultValue: option.description,
    });
    // Flag values still served by their schema default, so an admin can tell
    // at a glance what they have actually set versus what is just the default.
    const renderedValue =
      renderCurrentValue(option, value, config.locale) +
      (config.isDefault(key) ? config.t("config.defaultSuffix") : "");
    section.addTextDisplayComponents((text) =>
      text.setContent(
        config.t("config.option", {
          typeName: getConfigTypeName(option.type, config.t),
          optionName: optName,
          optionDesc: optDesc,
          currentValue: config.t("config.currentValue", {
            value: renderedValue,
          }),
        })
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
      text.setContent(config.t("config.noConfig"))
    );
  }

  // Pagination controls — shown only when the schema spans more than one page.
  // The target page is encoded in the customId so the handler can re-render.
  if (pageCount > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`config-page:${module.id}:${currentPage - 1}`)
          .setLabel(config.t("config.previous"))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`config-page:${module.id}:${currentPage + 1}`)
          .setLabel(config.t("config.next"))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === pageCount - 1)
      )
    );
  }

  return [container];
};
