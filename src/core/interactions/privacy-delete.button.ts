import { PRIVACY_DELETE_ID } from "#core/commands/privacy.command.js";
import { modules, unavailableModules } from "#core/runtime.js";
import mentionService from "#core/services/mention.service.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("core");

export async function deleteMemberData(
  guildId: string,
  userId: string
): Promise<boolean> {
  const deletions = [
    {
      moduleId: "core",
      run: () => mentionService.setMentionable(guildId, userId, true),
    },
    ...[...modules, ...unavailableModules.map(({ module }) => module)].flatMap(
      ({ id, deleteMemberData }) =>
        deleteMemberData
          ? [{ moduleId: id, run: () => deleteMemberData(guildId, userId) }]
          : []
    ),
  ];
  const results = await Promise.allSettled(deletions.map(({ run }) => run()));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(
        { err: result.reason },
        `Member data deletion failed | moduleId = ${deletions[index]!.moduleId} | guildId = ${guildId}`
      );
    }
  });
  return results.every((result) => result.status === "fulfilled");
}

export default declareInteractionHandler({
  customId: PRIVACY_DELETE_ID,
  access: "everyone",
  check: (interaction) => interaction.isButton(),
  async execute(interaction, _args, config) {
    if (!interaction.inGuild()) {
      return;
    }
    await interaction.deferUpdate();
    const deleted = await deleteMemberData(
      interaction.guildId,
      interaction.user.id
    );
    await interaction.editReply({
      content: config.t(deleted ? "privacy.deleted" : "privacy.failed"),
      components: [],
    });
  },
});
