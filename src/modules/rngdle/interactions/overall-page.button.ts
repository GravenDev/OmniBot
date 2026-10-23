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
import { DAY_MS } from "#modules/rngdle/services/days.js";
import {
  overallPage,
  parsePeriod,
  periodText,
  type Period,
  type ViewContext,
} from "#modules/rngdle/services/views.js";

const CUSTOM_ID = "rngdle-overall";

export type Visibility = "public" | "private";

function pageButton(customId: string, label: string, disabled: boolean) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);
}

export function pageRow(
  t: TFunction,
  id: (target: number | string) => string,
  page: number,
  pageCount: number
) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    pageButton(id(page - 1), t("config.previous"), page <= 1),
    pageButton(
      id("indicator"),
      t("overall.page", { current: page, total: pageCount }),
      true
    ).setStyle(ButtonStyle.Success),
    pageButton(id(page + 1), t("config.next"), page >= pageCount)
  );
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
    components: [pageRow(context.t, id, result.page, result.pageCount)],
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
