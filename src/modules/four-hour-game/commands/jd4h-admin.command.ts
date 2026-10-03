import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { requireAdmin } from "#core/utils/require-admin.js";
import { declareCommand } from "#lib/command.js";
import { loggerMaker } from "#lib/logger.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import fourHourGameService, {
  type SetScoreResult,
} from "#modules/four-hour-game/services/four-hour-game.service.js";

const PERMISSION_ADMINISTRATOR = 0x8;
const MAX_SCORE = 1_000_000_000;

const logger = loggerMaker("four-hour-game");

const SET_SCORE_MESSAGES: Record<SetScoreResult, string> = {
  created: "admin.set.created",
  updated: "admin.set.updated",
  removed: "admin.unset.done",
  absent: "admin.unset.none",
};

export default declareCommand<FourHourGameConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("jd4h-admin")
    .setDescription("4h game admin commands")
    .setDescriptionLocalizations({ fr: "Administration du jeu des 4h" })
    .setDefaultMemberPermissions(PERMISSION_ADMINISTRATOR)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set a member's score")
        .setDescriptionLocalizations({ fr: "Définir le score d'un membre" })
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member whose score to set")
            .setDescriptionLocalizations({ fr: "Membre dont fixer le score" })
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("score")
            .setDescription("New score (0 removes it)")
            .setDescriptionLocalizations({
              fr: "Nouveau score (0 le supprime)",
            })
            .setMinValue(0)
            .setMaxValue(MAX_SCORE)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("unset")
        .setDescription("Remove a member's score")
        .setDescriptionLocalizations({ fr: "Supprimer le score d'un membre" })
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member whose score to remove")
            .setDescriptionLocalizations({
              fr: "Membre dont supprimer le score",
            })
            .setRequired(true)
        )
    ),

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    if (!(await requireAdmin(interaction, config.t))) {
      return;
    }

    const member = interaction.options.getUser("member", true);
    const mention = `<@${member.id}>`;

    switch (interaction.options.getSubcommand()) {
      case "set": {
        const score = interaction.options.getInteger("score", true);
        const result = await fourHourGameService.setScore(
          interaction.guildId,
          member.id,
          score
        );
        logger.info(
          `Score ${result} | guildId = ${interaction.guildId} | userId = ${member.id} | score = ${score} | by = ${interaction.user.id}`
        );
        await interaction.reply({
          content: config.t(SET_SCORE_MESSAGES[result], {
            user: mention,
            score,
          }),
          flags: MessageFlags.Ephemeral,
        });
        break;
      }
      case "unset": {
        const deleted = await fourHourGameService.deleteScore(
          interaction.guildId,
          member.id
        );
        if (deleted) {
          logger.info(
            `Score removed | guildId = ${interaction.guildId} | userId = ${member.id} | by = ${interaction.user.id}`
          );
        }
        await interaction.reply({
          content: config.t(deleted ? "admin.unset.done" : "admin.unset.none", {
            user: mention,
          }),
          flags: MessageFlags.Ephemeral,
        });
        break;
      }
    }
  },
});
