import { MessageFlags, type ModalSubmitInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import {
  rename,
  setLimit,
  withChannel,
} from "#modules/temp-voice/services/actions.js";
import { parseUserLimit } from "#modules/temp-voice/services/naming.js";
import { MODAL_ID } from "#modules/temp-voice/services/panel.js";
import { outcomeText } from "#modules/temp-voice/services/views.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

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
    const value = interaction.fields.getTextInputValue("value");
    if (action === "limit" && parseUserLimit(value) === null) {
      await interaction.reply({
        content: config.t("limit.invalid"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (action !== "limit" && action !== "rename") {
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await withChannel(
      interaction.guild,
      channelId,
      interaction.member,
      config,
      (ctx) =>
        action === "limit"
          ? setLimit(ctx, parseUserLimit(value)!)
          : rename(ctx, value)
    );
    await interaction.editReply({
      content: outcomeText(config.t, outcome),
      allowedMentions: NO_MENTIONS,
    });
  },
});
