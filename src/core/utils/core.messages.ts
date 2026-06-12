import { ButtonStyle, ContainerBuilder, SectionBuilder } from "discord.js";
import {
  ConfigType,
  getConfigTypeName,
  type ConfigProvider,
  type ConfigSchema,
} from "../../lib/config.js";
import type { Module } from "../../lib/module.js";
import { Colors } from "../../utils/colors.js";
import configTypeHandlers from "../config/config-type-handlers.js";
import type moduleService from "../services/module.service.js";

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

export const configurationMessage = async <TSchema extends ConfigSchema>(
  module: Module<TSchema>,
  config: ConfigProvider<TSchema>,
  editedField: keyof TSchema | undefined = undefined
) => {
  const container = new ContainerBuilder().setAccentColor(Colors.Turquoise);
  container.addTextDisplayComponents((text) =>
    text.setContent(`# \`${module.name}\` settings`)
  );
  container.addSeparatorComponents((separator) => separator.setDivider(true));

  const schema = config.schema;

  for (const key in schema) {
    const option = schema[key];
    if (!option) continue;

    const value = config.get(key);
    const section = new SectionBuilder();
    section.addTextDisplayComponents((text) =>
      text.setContent(
        `-# ${getConfigTypeName(option.type)}\n**⚙️  ${option.name}**\n> ${option.description}\nCurrent: \`${value}\`\n\n`
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

  if (Object.keys(schema).length === 0) {
    container.addTextDisplayComponents((text) =>
      text.setContent("-# Ce module n'a aucune configuration disponible.")
    );
  }

  const components: ContainerBuilder[] = [container];

  if (editedField && schema[editedField]) {
    const fieldType = schema[editedField].type;

    if (!Array.isArray(fieldType)) {
      const comp = await configTypeHandlers[fieldType]?.editionSection(
        module,
        config,
        editedField
      );

      if (comp) {
        components.push(comp);
      }
    }
  }

  return components;
};
