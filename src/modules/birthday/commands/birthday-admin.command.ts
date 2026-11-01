import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { requireAdmin } from "#core/utils/require-admin.js";
import { declareCommand } from "#lib/command.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { BirthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import birthdayService from "#modules/birthday/services/birthday.service.js";
import { dropBirthdayRole } from "#modules/birthday/services/role.js";

const logger = loggerMaker("birthday");

// Deliberately no way to set someone else's birthday: only its member can
// consent to it being stored.
export default declareCommand<BirthdayConfigSchema>({
  data: new SlashCommandBuilder()
    .setName("birthday-admin")
    .setDescription("Birthday admin commands")
    .setDescriptionLocalizations({ fr: "Administration des anniversaires" })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([InteractionContextType.Guild])
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete a member's birthday")
        .setDescriptionLocalizations({
          fr: "Supprimer l'anniversaire d'un membre",
        })
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member whose birthday to delete")
            .setDescriptionLocalizations({
              fr: "Membre dont supprimer l'anniversaire",
            })
            .setRequired(true)
        )
    ),
  requiresAdmin: true,

  async execute(interaction, config) {
    if (!interaction.inGuild()) {
      return;
    }
    if (!(await requireAdmin(interaction, config.t))) {
      return;
    }

    const member = interaction.options.getUser("member", true);
    const removed = await birthdayService.remove(
      interaction.guildId,
      member.id
    );
    if (removed) {
      logger.info(
        `Birthday removed | guildId = ${interaction.guildId} | userId = ${member.id} | by = ${interaction.user.id}`
      );
      await dropBirthdayRole(config, interaction.guildId, member.id);
    }
    await interaction.reply({
      content: config.t(removed ? "admin.remove.done" : "admin.remove.none", {
        user: `<@${member.id}>`,
      }),
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
  },
});
