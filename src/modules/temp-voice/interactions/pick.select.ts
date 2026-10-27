import type { StringSelectMenuInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import {
  kick,
  revoke,
  transfer,
  withChannel,
} from "#modules/temp-voice/services/actions.js";
import { PICK_ID } from "#modules/temp-voice/services/panel.js";
import { outcomeText } from "#modules/temp-voice/services/views.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

export default declareInteractionHandler<
  StringSelectMenuInteraction,
  TempVoiceConfigSchema
>({
  customId: PICK_ID,
  access: "everyone",
  check: (interaction): interaction is StringSelectMenuInteraction =>
    interaction.isStringSelectMenu(),
  async execute(interaction, [action, channelId], config) {
    if (
      !interaction.inCachedGuild() ||
      !channelId ||
      (action !== "untrust" && action !== "kick" && action !== "transfer")
    ) {
      return;
    }
    await interaction.deferUpdate();
    const { values } = interaction;
    const outcome = await withChannel(
      interaction.guild,
      channelId,
      interaction.member,
      config,
      (ctx) => {
        if (action === "untrust") {
          return revoke(ctx, values);
        }
        const members = values
          .map((id) => ctx.guild.members.cache.get(id))
          .filter((member) => member !== undefined);
        const [first] = members;
        if (action === "kick") {
          return kick(ctx, members);
        }
        return first
          ? transfer(ctx, first)
          : Promise.resolve({ ok: false, key: "select.noMember" });
      }
    );
    await interaction.editReply({
      content: outcomeText(config.t, outcome),
      components: [],
      allowedMentions: NO_MENTIONS,
    });
  },
});
