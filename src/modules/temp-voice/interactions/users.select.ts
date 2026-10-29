import type { GuildMember, UserSelectMenuInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import {
  block,
  rememberNotice,
  trust,
  withChannel,
  type ActionContext,
  type Outcome,
} from "#modules/temp-voice/services/actions.js";
import { USERS_ID } from "#modules/temp-voice/services/panel.js";
import { notifyRow, outcomeText } from "#modules/temp-voice/services/views.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

const none: Outcome = { ok: false, key: "select.noMember" };

const ACTIONS: Record<
  string,
  (ctx: ActionContext, members: GuildMember[]) => Promise<Outcome>
> = {
  trust,
  block,
};

export default declareInteractionHandler<
  UserSelectMenuInteraction,
  TempVoiceConfigSchema
>({
  customId: USERS_ID,
  access: "everyone",
  check: (interaction): interaction is UserSelectMenuInteraction =>
    interaction.isUserSelectMenu(),
  async execute(interaction, [action, channelId], config) {
    const run = action ? ACTIONS[action] : undefined;
    if (!interaction.inCachedGuild() || !channelId) {
      return;
    }
    if (!run) {
      await interaction.update({
        content: config.t("panel.expired"),
        components: [],
      });
      return;
    }
    await interaction.deferUpdate();
    const members = [...interaction.members.values()];
    const outcome =
      members.length === 0
        ? none
        : await withChannel(
            interaction.guild,
            channelId,
            interaction.member,
            config,
            (ctx) => run(ctx, members)
          );
    const offerNotice = action === "trust" && outcome.ok;
    if (offerNotice) {
      rememberNotice(
        interaction.id,
        members.filter((member) => !member.user.bot).map((member) => member.id)
      );
    }
    await interaction.editReply({
      content: outcomeText(config.t, outcome),
      components: offerNotice
        ? [notifyRow(config.t, channelId, interaction.id)]
        : [],
      allowedMentions: NO_MENTIONS,
    });
  },
});
