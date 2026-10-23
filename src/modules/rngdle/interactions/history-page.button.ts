import { MessageFlags, type ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { DAY_MS } from "#modules/rngdle/services/days.js";
import store from "#modules/rngdle/services/store.js";
import { HISTORY_PAGE_ID, historyMessage } from "./navigation.button.js";

export default declareInteractionHandler<ButtonInteraction>({
  customId: HISTORY_PAGE_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(
    interaction,
    [rawPage, userId, rawCount, visibility, anchor],
    config
  ) {
    const page = Number(rawPage);
    const count = Number(rawCount);
    const anchorDay = Number(anchor);
    if (!interaction.inGuild() || !Number.isInteger(page) || !userId) {
      return;
    }

    if (visibility === "private") {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    const account = await store.account(interaction.guildId, userId);
    await interaction.editReply({
      content: "",
      files: [],
      attachments: [],
      components: [],
      ...(await historyMessage(
        {
          client: interaction.client,
          guildId: interaction.guildId,
          t: config.t,
          locale: config.locale,
        },
        account,
        userId === interaction.user.id,
        rawCount && Number.isInteger(count) ? count : undefined,
        page,
        "private",
        anchor && Number.isInteger(anchorDay)
          ? new Date(anchorDay * DAY_MS)
          : new Date()
      )),
    });
  },
});
