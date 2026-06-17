import {
  ContainerBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { configurationMessage } from "#core/utils/core-messages.js";
import { modules } from "#index.js";
import { declareCommand } from "#lib/command.js";
import { Colors } from "#utils/colors.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure the modules of the bot")
    .setDescriptionLocalizations({ fr: "Configurer les modules du bot" })
    .setDefaultMemberPermissions(0x8)
    .addStringOption((option) =>
      option
        .setName("module")
        .setDescription("The module to configure")
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async execute(interaction) {
    const moduleId = interaction.options.getString("module", true);
    const module = [...modules, coreModule].find((m) => m.id === moduleId);

    if (!module) {
      const coreConfig = await configService.getConfigForModuleIn(
        coreModule,
        interaction.guildId!
      );

      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(Colors.Red)
            .addTextDisplayComponents((text) =>
              text.setContent(coreConfig.t("config.noModule", { moduleId }))
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const configProvider = await configService.getConfigForModuleIn(
      module,
      interaction.guildId!
    );

    const components = await configurationMessage(module, configProvider);

    // Public on purpose: a server-wide setting change should be visible to all.
    await interaction.reply({
      components,
      flags: MessageFlags.IsComponentsV2,
    });
  },
  async complete(interaction) {
    const [modules, coreConfig] = await Promise.all([
      moduleService.getAllModulesStateIn(interaction.guildId!),
      configService.getConfigForModuleIn(coreModule, interaction.guildId!),
    ]);

    const t = coreConfig.t;
    const moduleEntries = modules
      .filter((m) => m.enabled)
      .map((m) => ({
        name: t("modules." + m.module.id + ".name", {
          defaultValue: m.module.name,
        }),
        value: m.module.id,
      }));

    await interaction.respond([
      ...moduleEntries,
      {
        name: t("modules." + coreModule.id + ".name", {
          defaultValue: coreModule.name,
        }),
        value: coreModule.id,
      },
    ]);
  },
});
