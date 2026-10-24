import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
} from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import {
  isClashMode,
  type ClashMode,
} from "#modules/clash-of-code/services/api.js";
import {
  leaderboardPage,
  type ViewContext,
} from "#modules/clash-of-code/services/views.js";

const CUSTOM_ID = "coc-leaderboard";
const ALL_MODES = "all";

export type Visibility = "public" | "private";

function pageButton(customId: string, label: string, disabled: boolean) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}

export async function leaderboardMessage(
  context: ViewContext,
  mode: ClashMode | null,
  page: number,
  callerId: string,
  visibility: Visibility
) {
  const result = await leaderboardPage(context, mode, page, callerId);
  if (!result) {
    return {
      content: context.t("leaderboard.empty"),
      files: [],
      attachments: [],
      components: [],
    };
  }

  const id = (target: number | string) =>
    `${CUSTOM_ID}:${target}:${visibility}:${mode ?? ALL_MODES}`;
  // The card names the leaderboard and its mode: no text above it. An empty
  // content also clears a text left by an earlier edit of the same message.
  return {
    content: "",
    files: [new AttachmentBuilder(result.image, { name: "leaderboard.png" })],
    attachments: [],
    components:
      result.pageCount > 1
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              pageButton(
                id(result.page - 1),
                context.t("config.previous"),
                result.page <= 1
              ),
              pageButton(
                id("indicator"),
                context.t("leaderboard.page", {
                  current: result.page,
                  total: result.pageCount,
                }),
                true
              ).setStyle(ButtonStyle.Success),
              pageButton(
                id(result.page + 1),
                context.t("config.next"),
                result.page >= result.pageCount
              )
            ),
          ]
        : [],
  };
}

export default declareInteractionHandler<ButtonInteraction>({
  customId: CUSTOM_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [rawPage, visibility, rawMode], config) {
    const page = Number(rawPage);
    if (!interaction.inGuild() || !Number.isInteger(page)) {
      return;
    }

    // The public message stays put: each viewer pages through a copy of their own.
    if (visibility === "private") {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    await interaction.editReply(
      await leaderboardMessage(
        {
          client: interaction.client,
          guildId: interaction.guildId,
          t: config.t,
          locale: config.locale,
        },
        isClashMode(rawMode) ? rawMode : null,
        page,
        interaction.user.id,
        "private"
      )
    );
  },
});
