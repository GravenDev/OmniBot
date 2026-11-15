import type { StringSelectMenuInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { PICK_ID } from "#modules/temp-voice/panel.js";
import actions from "#modules/temp-voice/services/actions.service.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";
import { outcomeText } from "#modules/temp-voice/views.js";

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
    const outcome = await actions.withChannel(
      interaction.guild,
      channelId,
      interaction.member,
      config,
      (ctx) => {
        if (action === "untrust") {
          return actions.revoke(ctx, values);
        }
        const members = values
          .map((id) => ctx.guild.members.cache.get(id))
          .filter((member) => member !== undefined);
        const [first] = members;
        if (action === "kick") {
          return actions.kick(ctx, members);
        }
        return first
          ? actions.transfer(ctx, first)
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
