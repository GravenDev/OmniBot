import { createHash } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import store from "#modules/rngdle/services/store.js";
import sync from "#modules/rngdle/services/sync.js";

const CUSTOM_ID = "rngdle-unlink";

const logger = loggerMaker("rngdle");

function usernameTag(username: string): string {
  return createHash("sha256")
    .update(username.toLowerCase())
    .digest("hex")
    .slice(0, 8);
}

export function unlinkConfirmMessage(
  t: TFunction,
  userId: string,
  username: string
) {
  return {
    content: t("unlink.confirm", { username }),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `${CUSTOM_ID}:confirm:${userId}:${usernameTag(username)}`
          )
          .setLabel(t("unlink.confirmButton"))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${CUSTOM_ID}:cancel:${userId}`)
          .setLabel(t("unlink.cancelButton"))
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

export default declareInteractionHandler<ButtonInteraction>({
  customId: CUSTOM_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [action, userId, tag], config) {
    if (!interaction.inGuild()) {
      return;
    }
    if (userId !== interaction.user.id) {
      await interaction.reply({
        content: config.t("unlink.notYours"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action !== "confirm") {
      await interaction.update({
        content: config.t("unlink.cancelled"),
        components: [],
      });
      return;
    }

    await interaction.deferUpdate();
    const { guildId } = interaction;
    const outcome = await sync.exclusive(guildId, async () => {
      const account = await store.account(guildId, userId);
      if (!account) {
        return "none";
      }
      if (usernameTag(account.username) !== tag) {
        return "stale";
      }
      return (await store.unregister(guildId, userId)) ? "done" : "none";
    });
    if (outcome === "done") {
      logger.info(
        `Account unlinked by its owner | guildId = ${guildId} | userId = ${userId}`
      );
    }
    await interaction.editReply({
      content: config.t(`unlink.${outcome}`),
      components: [],
    });
  },
});
