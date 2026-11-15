import { MessageFlags, type ModalSubmitInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { parseUserLimit } from "#modules/temp-voice/naming.js";
import { MODAL_ID } from "#modules/temp-voice/panel.js";
import actions from "#modules/temp-voice/services/actions.service.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";
import { outcomeText } from "#modules/temp-voice/views.js";

export default declareInteractionHandler<
  ModalSubmitInteraction,
  TempVoiceConfigSchema
>({
  customId: MODAL_ID,
  access: "everyone",
  check: (interaction): interaction is ModalSubmitInteraction =>
    interaction.isModalSubmit(),
  async execute(interaction, [action, channelId], config) {
    if (!interaction.inCachedGuild() || !channelId) {
      return;
    }
    if (action !== "edit") {
      await interaction.reply({
        content: config.t("panel.expired"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const name = interaction.fields.getTextInputValue("name");
    const userLimit = parseUserLimit(
      interaction.fields.getTextInputValue("limit")
    );
    if (userLimit === null) {
      await interaction.reply({
        content: config.t("limit.invalid"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await actions.withChannel(
      interaction.guild,
      channelId,
      interaction.member,
      config,
      (ctx) => actions.edit(ctx, name, userLimit)
    );
    await interaction.editReply({
      content: outcomeText(config.t, outcome),
      allowedMentions: NO_MENTIONS,
    });
  },
});
