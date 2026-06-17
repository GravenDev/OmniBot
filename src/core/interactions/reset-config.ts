import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  getConfigEntry,
  refreshSourceConfigMessageAtPage,
  resolveConfigurableModule,
} from "#core/config/config-edit.js";
import configService from "#core/services/config.service.js";
import { getCoreT, replyWithCoreT } from "#core/utils/core-config.js";
import type { ConfigProvider, ConfigSchema } from "#lib/config.js";
import { declareInteractionHandler } from "#lib/interaction.js";

/** Sentinel select value meaning "reset every field of the module". */
const RESET_ALL = "*all*";

/**
 * Opens, from the public `/config` panel, an ephemeral picker listing the
 * fields currently overridden (plus an "all fields" entry) to reset to default.
 * A reset just clears the stored value; the lazy default takes over on read.
 */
export const resetConfigButton = declareInteractionHandler({
  customId: "reset-config",
  requiresAdmin: true,
  check: (interaction) => interaction.isButton(),
  async execute(interaction, [moduleId, page]) {
    const module = resolveConfigurableModule(moduleId);
    if (!module) {
      await replyWithCoreT(interaction, "interaction.moduleNotFound");
      return;
    }

    // Typed as a generic schema provider so `isSet(key)` accepts string keys
    // (the resolved module is non-generic, i.e. ConfigProvider<{}>).
    const config = (await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    )) as unknown as ConfigProvider<ConfigSchema>;
    const t = config.t;

    const schema = module.config as ConfigSchema;
    const overridden = Object.keys(schema).filter((key) => config.isSet(key));
    if (overridden.length === 0) {
      await interaction.reply({
        content: t("config.reset.nothing"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const customId = `reset-config-select:${module.id}:${page}:${interaction.message.id}`;
    const options = [
      { label: t("config.reset.all"), value: RESET_ALL },
      ...overridden.map((key) => ({
        label: t("config." + key + ".name", {
          defaultValue: getConfigEntry(module, key)?.name ?? key,
        }),
        value: key,
      })),
    ];

    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(t("config.reset.placeholder"))
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options);

    await interaction.reply({
      components: [
        new ContainerBuilder().addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            menu
          )
        ),
      ],
      flags: MessageFlags.Ephemeral + MessageFlags.IsComponentsV2,
    });
  },
});

/**
 * Applies the field picker's selection: resets the chosen fields (or all),
 * acknowledges in the ephemeral message, then refreshes the public panel.
 */
export const resetConfigSelect =
  declareInteractionHandler<StringSelectMenuInteraction>({
    customId: "reset-config-select",
    requiresAdmin: true,
    check: (interaction) => interaction.isStringSelectMenu(),
    async execute(interaction, [moduleId, pageStr, sourceMessageId]) {
      const module = resolveConfigurableModule(moduleId);
      if (!module) {
        await replyWithCoreT(interaction, "interaction.moduleNotFound");
        return;
      }

      const selected = interaction.values;
      if (selected.includes(RESET_ALL)) {
        await configService.resetConfigForModuleIn(
          module,
          interaction.guildId!
        );
      } else {
        await configService.resetFieldsForModuleIn(
          module,
          interaction.guildId!,
          selected
        );
      }

      const t = await getCoreT(interaction.guildId!);
      await interaction.update({
        components: [
          new ContainerBuilder().addTextDisplayComponents((text) =>
            text.setContent(t("config.reset.done"))
          ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      const page = Number(pageStr);
      await refreshSourceConfigMessageAtPage(
        interaction,
        module,
        sourceMessageId,
        Number.isFinite(page) ? page : 0
      );
    },
  });
