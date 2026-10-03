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
  overallPage,
  type ViewContext,
} from "#modules/rngdle/services/views.js";

const CUSTOM_ID = "rngdle-overall";

type Visibility = "public" | "private";

function pageButton(customId: string, label: string, disabled: boolean) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}

export async function overallPageMessage(
  context: ViewContext,
  page: number,
  callerId: string,
  visibility: Visibility
) {
  const result = await overallPage(context, page, callerId);
  if (!result) {
    return {
      content: context.t("overall.empty"),
      files: [],
      attachments: [],
      components: [],
    };
  }

  const id = (target: number | string) =>
    `${CUSTOM_ID}:${target}:${visibility}`;
  return {
    content: "",
    files: [new AttachmentBuilder(result.image, { name: "leaderboard.png" })],
    attachments: [],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        pageButton(
          id(result.page - 1),
          context.t("config.previous"),
          result.page <= 1
        ),
        pageButton(
          id("indicator"),
          context.t("overall.page", {
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
    ],
  };
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

    if (visibility === "private") {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    await interaction.editReply(
      await overallPageMessage(
        {
          client: interaction.client,
          guildId: interaction.guildId,
          t: config.t,
          locale: config.locale,
        },
        page,
        interaction.user.id,
        "private"
      )
    );
  },
});
