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
  parsePeriod,
  periodText,
  type Period,
  type ViewContext,
} from "#modules/rngdle/services/views.js";

const CUSTOM_ID = "rngdle-overall";
const DAY_MS = 24 * 60 * 60 * 1000;

export type Visibility = "public" | "private";

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
  visibility: Visibility,
  period: Period = "all",
  now: Date = new Date()
) {
  const result = await overallPage(context, page, callerId, period, now);
  if (!result) {
    return {
      content: context.t(
        period === "all" ? "overall.empty" : "overall.emptyPeriod"
      ),
      files: [],
      attachments: [],
      components: [],
    };
  }

  const anchor =
    period === "all" ? "" : `:${Math.floor(now.getTime() / DAY_MS)}`;
  const id = (target: number | string) =>
    `${CUSTOM_ID}:${target}:${visibility}:${period}${anchor}`;
  return {
    content: periodText(context, period, now),
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
  async execute(interaction, [rawPage, visibility, period, anchor], config) {
    const page = Number(rawPage);
    const anchorDay = Number(anchor);
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
        "private",
        parsePeriod(period),
        anchor && Number.isInteger(anchorDay)
          ? new Date(anchorDay * DAY_MS)
          : new Date()
      )
    );
  },
});
