import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import moduleService from "#core/services/module.service.js";
import { modulesMessage } from "#core/utils/core-messages.js";
import { declareCommand } from "#lib/command.js";

const PERMISSION_ADMINISTRATOR = 0x8;

export default declareCommand({
  data: new SlashCommandBuilder()
    .setName("modules")
    .setDescription("Manage server modules")
    .setDefaultMemberPermissions(PERMISSION_ADMINISTRATOR)
    .setContexts([InteractionContextType.Guild]),

  async execute(interaction) {
    const defer = await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const modulesState = await moduleService.getAllModulesStateIn(
      interaction.guildId!
    );

    await defer.edit({
      components: [modulesMessage(modulesState)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
