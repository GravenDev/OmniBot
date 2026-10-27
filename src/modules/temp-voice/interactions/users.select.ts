import type { GuildMember, UserSelectMenuInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import {
  block,
  invite,
  trust,
  withChannel,
  type ActionContext,
  type Outcome,
} from "#modules/temp-voice/services/actions.js";
import { USERS_ID } from "#modules/temp-voice/services/panel.js";
import { outcomeText } from "#modules/temp-voice/services/views.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

const none: Outcome = { ok: false, key: "select.noMember" };

const ACTIONS: Record<
  string,
  (ctx: ActionContext, members: GuildMember[]) => Promise<Outcome>
> = {
  trust,
  block,
  invite: (ctx, [member]) =>
    member ? invite(ctx, member) : Promise.resolve(none),
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
    if (!interaction.inCachedGuild() || !run || !channelId) {
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
    await interaction.editReply({
      content: outcomeText(config.t, outcome),
      components: [],
      allowedMentions: NO_MENTIONS,
    });
  },
});
