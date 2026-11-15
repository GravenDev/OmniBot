import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { isAccessMode } from "#modules/temp-voice/access-mode.js";
import { ACCESS_ID } from "#modules/temp-voice/panel.js";
import actions from "#modules/temp-voice/services/actions.service.js";
import lifecycle from "#modules/temp-voice/services/lifecycle.service.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";
import { outcomeText } from "#modules/temp-voice/views.js";

export default declareInteractionHandler<
  StringSelectMenuInteraction,
  TempVoiceConfigSchema
>({
  customId: ACCESS_ID,
  access: "everyone",
  check: (interaction): interaction is StringSelectMenuInteraction =>
    interaction.isStringSelectMenu(),
  async execute(interaction, [channelId], config) {
    const [mode] = interaction.values;
    if (!interaction.inCachedGuild() || !channelId || !isAccessMode(mode)) {
      return;
    }
    const redraw = () =>
      lifecycle.queue.run(channelId, () =>
        actions.redrawPanel(interaction.guild, channelId, config)
      );
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await actions
      .withChannel(
        interaction.guild,
        channelId,
        interaction.member,
        config,
        (ctx) => actions.setAccess(ctx, mode)
      )
      .catch(async (err: unknown) => {
        await redraw();
        throw err;
      });
    if (!outcome.ok) {
      await redraw();
    }
    await interaction.editReply({
      content: outcomeText(config.t, outcome),
      allowedMentions: NO_MENTIONS,
    });
  },
});
