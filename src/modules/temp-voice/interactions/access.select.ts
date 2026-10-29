import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { isAccessMode } from "#modules/temp-voice/services/access-mode.js";
import {
  redrawPanel,
  setAccess,
  withChannel,
} from "#modules/temp-voice/services/actions.js";
import { ACCESS_ID } from "#modules/temp-voice/services/panel.js";
import { outcomeText } from "#modules/temp-voice/services/views.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const outcome = await withChannel(
      interaction.guild,
      channelId,
      interaction.member,
      config,
      (ctx) => setAccess(ctx, mode)
    ).catch(async (err: unknown) => {
      await redrawPanel(interaction.guild, channelId, config);
      throw err;
    });
    if (!outcome.ok) {
      await redrawPanel(interaction.guild, channelId, config);
    }
    await interaction.editReply({
      content: outcomeText(config.t, outcome),
      allowedMentions: NO_MENTIONS,
    });
  },
});
