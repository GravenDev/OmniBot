import { MessageFlags, type ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import {
  authorize,
  claim,
  remove,
  setHidden,
  setLocked,
  withChannel,
  type ActionContext,
  type Outcome,
} from "#modules/temp-voice/services/actions.js";
import {
  isPanelAction,
  PANEL_ID,
  type PanelAction,
} from "#modules/temp-voice/services/panel.js";
import {
  limitModal,
  outcomeText,
  presentSelect,
  renameModal,
  revokeSelect,
  userSelect,
} from "#modules/temp-voice/services/views.js";
import type { TempVoiceConfigSchema } from "#modules/temp-voice/temp-voice.config.js";

const IMMEDIATE: Partial<
  Record<PanelAction, (ctx: ActionContext) => Promise<Outcome>>
> = {
  lock: (ctx) => setLocked(ctx, true),
  unlock: (ctx) => setLocked(ctx, false),
  hide: (ctx) => setHidden(ctx, true),
  show: (ctx) => setHidden(ctx, false),
  claim,
  delete: remove,
};

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

export default declareInteractionHandler<
  ButtonInteraction,
  TempVoiceConfigSchema
>({
  customId: PANEL_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [action, channelId], config) {
    if (!interaction.inCachedGuild() || !isPanelAction(action) || !channelId) {
      return;
    }
    const { guild, member: actor } = interaction;
    const t = config.t;

    const immediate = IMMEDIATE[action];
    if (immediate) {
      await interaction.deferReply(ephemeral);
      const outcome = await withChannel(
        guild,
        channelId,
        actor,
        config,
        immediate,
        { ownerOnly: action !== "claim" }
      );
      await interaction
        .editReply({
          content: outcomeText(t, outcome),
          allowedMentions: NO_MENTIONS,
        })
        .catch(() => undefined);
      return;
    }

    const authorized = await authorize(guild, channelId, actor);
    if ("key" in authorized) {
      await interaction.reply({
        content: outcomeText(t, authorized),
        ...ephemeral,
      });
      return;
    }
    const { channel, row } = authorized;

    switch (action) {
      case "rename":
        await interaction.showModal(renameModal(t, channelId, channel.name));
        return;
      case "limit":
        await interaction.showModal(
          limitModal(t, channelId, channel.userLimit)
        );
        return;
      case "trust":
      case "invite":
      case "block":
        await interaction.reply({
          ...userSelect(t, action, channelId),
          ...ephemeral,
        });
        return;
      case "kick":
      case "transfer": {
        const select = presentSelect(t, action, channel, row, actor.id);
        await interaction.reply(
          select
            ? { ...select, ...ephemeral }
            : { content: t(`${action}.empty`), ...ephemeral }
        );
        return;
      }
      case "untrust": {
        const select = revokeSelect(t, guild, row);
        await interaction.reply(
          select
            ? { ...select, ...ephemeral }
            : { content: t("revoke.empty"), ...ephemeral }
        );
        return;
      }
      default:
        return;
    }
  },
});
