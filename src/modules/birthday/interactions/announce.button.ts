import type { ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { BirthdayConfigSchema } from "#modules/birthday/birthday.config.js";
import {
  ANNOUNCE_BUTTON_ID,
  showMessage,
} from "#modules/birthday/commands/own-birthday.js";
import birthdayService from "#modules/birthday/services/birthday.service.js";
import { dropBirthdayRole } from "#modules/birthday/services/role.js";

const logger = loggerMaker("birthday");

/**
 * Announces, or stops announcing, the birthday of the member who pressed the
 * button: always their own, whoever's reply it is on.
 */
export default declareInteractionHandler<
  ButtonInteraction,
  BirthdayConfigSchema
>({
  customId: ANNOUNCE_BUTTON_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [state], config) {
    if (!interaction.inGuild() || (state !== "on" && state !== "off")) {
      return;
    }
    await interaction.deferUpdate();
    const { guildId } = interaction;
    const userId = interaction.user.id;
    const entries = await birthdayService.list(guildId);
    const own = entries.find((entry) => entry.userId === userId);
    if (!own) {
      await interaction.editReply({
        content: config.t("show.none"),
        components: [],
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    const entry = { ...own, announce: state === "on" };
    if (entry.announce !== own.announce) {
      await birthdayService.set(guildId, entry);
      logger.info(
        `Birthday announcement ${state} | guildId = ${guildId} | userId = ${userId}`
      );
      if (!entry.announce) {
        await dropBirthdayRole(config, guildId, userId);
      }
    }
    await interaction.editReply({
      ...(await showMessage(
        interaction,
        config,
        entry,
        entries.map((other) => (other.userId === userId ? entry : other))
      )),
      allowedMentions: NO_MENTIONS,
    });
  },
});
