import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { modulesMessage } from "#core/utils/core-messages.js";
import { declareCommand } from "#lib/command.js";

const PERMISSION_ADMINISTRATOR = 0x8;

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("modules")
    .setDescription("Manage server modules")
    .setDescriptionLocalizations({ fr: "Gérer les modules du serveur" })
    .setDefaultMemberPermissions(PERMISSION_ADMINISTRATOR)
    .setContexts([InteractionContextType.Guild]),

  async execute(interaction) {
    const defer = await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const [modulesState, coreConfig] = await Promise.all([
      moduleService.getAllModulesStateIn(interaction.guildId!),
      configService.getConfigForModuleIn(coreModule, interaction.guildId!),
    ]);

    await defer.edit({
      components: [modulesMessage(modulesState, coreConfig.t)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
