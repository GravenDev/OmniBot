import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { loggerMaker } from "#lib/logger.js";
import { replyWithError } from "#modules/rngdle/commands/replies.js";
import { cachedOverallPage } from "#modules/rngdle/services/boards.js";

const logger = loggerMaker("rngdle");

const CUSTOM_ID = "rngdle-overall";

type Visibility = "public" | "private";

export function overallPageComponents(
  page: number,
  pageCount: number,
  visibility: Visibility,
  t: TFunction
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_ID}:${page - 1}:${visibility}`)
        .setLabel(t("config.previous"))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_ID}:indicator:${visibility}`)
        .setLabel(t("overall.page", { current: page, total: pageCount }))
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_ID}:${page + 1}:${visibility}`)
        .setLabel(t("config.next"))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= pageCount)
    ),
  ];
}

export default declareInteractionHandler<ButtonInteraction>({
  customId: CUSTOM_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [rawPage, visibility], config) {
    const page = Number(rawPage);
    if (!interaction.inGuild() || !Number.isInteger(page)) {
      return;
    }

    try {
      if (visibility === "private") {
        await interaction.deferUpdate();
      } else {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      const result = await cachedOverallPage(
        interaction.client,
        interaction.guildId,
        page,
        interaction.user.id,
        config.t,
        config.locale
      );
      if (!result) {
        await interaction.editReply({
          content: config.t("overall.empty"),
          files: [],
          attachments: [],
          components: [],
        });
        return;
      }

      await interaction.editReply({
        content: "",
        files: [
          new AttachmentBuilder(result.image, { name: "leaderboard.png" }),
        ],
        attachments: [],
        components: overallPageComponents(
          result.page,
          result.pageCount,
          "private",
          config.t
        ),
      });
    } catch (err) {
      logger.error(
        { err },
        `RNGdle page button failed | guildId = ${interaction.guildId}`
      );
      await replyWithError(interaction, config.t("error.generic"));
    }
  },
});
