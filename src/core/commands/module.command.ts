import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import coreModule from "#core/core.module.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { modulesMessage } from "#core/utils/core-messages.js";
import { declareCommand } from "#lib/command.js";

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("modules")
    .setDescription("Manage server modules")
    .setDescriptionLocalizations({ fr: "Gérer les modules du serveur" })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild]),

  requiresAdmin: true,

  async execute(interaction) {
    // Admin access is enforced centrally by the command dispatcher via
    // `requiresAdmin` — checked before deferring (a reply needs a fresh
    // interaction).
    const coreConfig = await configService.getConfigForModuleIn(
      coreModule,
      interaction.guildId!
    );

    const defer = await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const modulesState = await moduleService.getAllModulesStateIn(
      interaction.guildId!
    );

    await defer.edit({
      components: [modulesMessage(modulesState, coreConfig.t)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
