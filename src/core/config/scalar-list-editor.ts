import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from "discord.js";
import {
  ConfigType,
  ConfigValidator,
  getConfigTypeName,
  type ListOf,
} from "../../lib/config.js";
import { declareInteractionHandler } from "../../lib/interaction.js";
import type { Module } from "../../lib/module.js";
import type { Registry } from "../../lib/registry.js";
import { Colors } from "../../utils/colors.js";
import configService from "../services/config.service.js";
import {
  getConfigEntry,
  refreshSourceConfigMessage,
  resolveConfigurableModule,
} from "./config-edit.js";

/**
 * Editor for scalar list config values (STRING / NUMBER / BOOLEAN lists).
 *
 * Discord has no native widget for editing an arbitrary list of scalars, so we
 * render a dedicated ephemeral message: one row per item with a remove button,
 * plus an "add" button. STRING/NUMBER add via a validated modal; BOOLEAN items
 * are toggled in place and "add" inserts a `false` directly.
 */

function baseType(entry: {
  type: ConfigType | ListOf<ConfigType>;
}): ConfigType {
  return (entry.type as ListOf<ConfigType>)[0];
}

function inputLabel(type: ConfigType): string {
  switch (type) {
    case ConfigType.NUMBER:
      return "Valeur (nombre)";
    case ConfigType.BOOLEAN:
      return "Valeur (true / false)";
    default:
      return "Valeur (texte)";
  }
}

function parseScalar(raw: string, type: ConfigType): string | number | boolean {
  switch (type) {
    case ConfigType.NUMBER:
      return Number(raw);
    case ConfigType.BOOLEAN:
      return raw.toLowerCase() === "true";
    default:
      return raw;
  }
}

/**
 * Builds the list editor message components for the current values.
 *
 * `sourceMessageId` is the id of the public `/config` message that opened this
 * editor; it is threaded through the buttons' customIds so each edit can refresh
 * that message.
 */
export function scalarListEditorMessage(
  module: Module,
  key: string,
  values: unknown[],
  sourceMessageId: string
): ContainerBuilder[] {
  const entry = getConfigEntry(module, key);
  const container = new ContainerBuilder().setAccentColor(Colors.Turquoise);

  container.addTextDisplayComponents((text) =>
    text.setContent(
      `# \`${module.name}\` — ${entry?.name ?? key}\n` +
        `-# ${entry ? getConfigTypeName(entry.type) : ""}\n> ${entry?.description ?? ""}`
    )
  );
  container.addSeparatorComponents((separator) => separator.setDivider(true));

  const type = entry ? baseType(entry) : ConfigType.STRING;
  const idSuffix = `${module.id}:${key}:${sourceMessageId}`;

  if (values.length === 0) {
    container.addTextDisplayComponents((text) =>
      text.setContent("-# Liste vide.")
    );
  } else if (type === ConfigType.BOOLEAN) {
    // Booleans are flipped in place via a toggle; a separate remove button drops them.
    values.forEach((value, index) => {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`toggle-list-item:${idSuffix}:${index}`)
          .setLabel(`Élément ${index + 1} : ${value ? "vrai" : "faux"}`)
          .setStyle(value ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`remove-list-item:${idSuffix}:${index}`)
          .setLabel("Supprimer")
          .setStyle(ButtonStyle.Secondary)
      );
      container.addActionRowComponents(row);
    });
  } else {
    values.forEach((value, index) => {
      const section = new SectionBuilder()
        .addTextDisplayComponents((text) =>
          text.setContent(`\`${String(value)}\``)
        )
        .setButtonAccessory((button) =>
          button
            .setCustomId(`remove-list-item:${idSuffix}:${index}`)
            .setLabel("Supprimer")
            .setStyle(ButtonStyle.Danger)
        );
      container.addSectionComponents(section);
    });
  }

  const addRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`add-list-item:${idSuffix}`)
      .setLabel("Ajouter")
      .setStyle(ButtonStyle.Success)
  );
  container.addActionRowComponents(addRow);

  return [container];
}

/** Opens the list editor as a fresh ephemeral message. */
export async function openScalarListEditor(
  interaction: ButtonInteraction,
  module: Module,
  key: string,
  values: unknown[],
  sourceMessageId: string
): Promise<void> {
  await interaction.reply({
    components: scalarListEditorMessage(module, key, values, sourceMessageId),
    flags: MessageFlags.Ephemeral + MessageFlags.IsComponentsV2,
  });
}

const addListItem = declareInteractionHandler({
  customId: "add-list-item",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  execute: async (interaction, [moduleId, key, sourceMessageId]) => {
    const module = resolveConfigurableModule(moduleId);
    if (!module || !configService.isConfigKey(module, key)) {
      await interaction.reply({
        content: "Configuration introuvable.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const entry = getConfigEntry(module, key)!;
    const type = baseType(entry);

    // Booleans are added directly (then toggled in place) — no modal to type.
    if (type === ConfigType.BOOLEAN) {
      const provider = await configService.getConfigForModuleIn(
        module,
        interaction.guildId!
      );
      const values = [
        ...((provider.get(key) as unknown[] | undefined) ?? []),
        false,
      ];
      await configService.updateConfigForModuleIn(
        module,
        interaction.guildId!,
        {
          [key]: values,
        }
      );

      await interaction.update({
        components: scalarListEditorMessage(
          module,
          key,
          values,
          sourceMessageId!
        ),
        flags: MessageFlags.IsComponentsV2,
      });
      await refreshSourceConfigMessage(interaction, module, sourceMessageId);
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`add-list-item-modal:${module.id}:${key}:${sourceMessageId}`)
      .setTitle(`Ajouter — ${entry.name}`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel(inputLabel(type))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
  },
});

const toggleListItem = declareInteractionHandler({
  customId: "toggle-list-item",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  execute: async (interaction, [moduleId, key, sourceMessageId, indexRaw]) => {
    const module = resolveConfigurableModule(moduleId);
    if (!module || !configService.isConfigKey(module, key)) {
      await interaction.reply({
        content: "Configuration introuvable.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const provider = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );
    const values = [...((provider.get(key) as unknown[] | undefined) ?? [])];

    const index = Number(indexRaw);
    if (Number.isInteger(index) && index >= 0 && index < values.length) {
      values[index] = !values[index];
    }

    await configService.updateConfigForModuleIn(module, interaction.guildId!, {
      [key]: values,
    });

    await interaction.update({
      components: scalarListEditorMessage(
        module,
        key,
        values,
        sourceMessageId!
      ),
      flags: MessageFlags.IsComponentsV2,
    });
    await refreshSourceConfigMessage(interaction, module, sourceMessageId);
  },
});

const addListItemModal = declareInteractionHandler({
  customId: "add-list-item-modal",
  requiresAdmin: true,
  check: (interaction) => interaction.isModalSubmit(),
  execute: async (interaction, [moduleId, key, sourceMessageId]) => {
    const module = resolveConfigurableModule(moduleId);
    if (!module || !configService.isConfigKey(module, key)) {
      await interaction.reply({
        content: "Configuration introuvable.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const type = baseType(getConfigEntry(module, key)!);
    const raw = interaction.fields.getTextInputValue("value").trim();
    if (!ConfigValidator[type](raw)) {
      await interaction.reply({
        content: `❌ \`${raw}\` n'est pas une valeur valide.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const provider = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );
    const values = [
      ...((provider.get(key) as unknown[] | undefined) ?? []),
      parseScalar(raw, type),
    ];
    await configService.updateConfigForModuleIn(module, interaction.guildId!, {
      [key]: values,
    });

    const components = scalarListEditorMessage(
      module,
      key,
      values,
      sourceMessageId!
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
    await refreshSourceConfigMessage(interaction, module, sourceMessageId);
  },
});

const removeListItem = declareInteractionHandler({
  customId: "remove-list-item",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  execute: async (interaction, [moduleId, key, sourceMessageId, indexRaw]) => {
    const module = resolveConfigurableModule(moduleId);
    if (!module || !configService.isConfigKey(module, key)) {
      await interaction.reply({
        content: "Configuration introuvable.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const provider = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );
    const values = [...((provider.get(key) as unknown[] | undefined) ?? [])];

    const index = Number(indexRaw);
    if (Number.isInteger(index) && index >= 0 && index < values.length) {
      values.splice(index, 1);
    }

    await configService.updateConfigForModuleIn(module, interaction.guildId!, {
      [key]: values,
    });

    await interaction.update({
      components: scalarListEditorMessage(
        module,
        key,
        values,
        sourceMessageId!
      ),
      flags: MessageFlags.IsComponentsV2,
    });
    await refreshSourceConfigMessage(interaction, module, sourceMessageId);
  },
});

/** Registers the scalar list editor interaction handlers. */
export function registerScalarListEditorHandlers(registry: Registry): void {
  registry.register(addListItem);
  registry.register(addListItemModal);
  registry.register(removeListItem);
  registry.register(toggleListItem);
}
