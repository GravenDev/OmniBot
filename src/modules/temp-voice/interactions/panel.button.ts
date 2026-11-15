import { MessageFlags, type ButtonInteraction } from "discord.js";
import { declareInteractionHandler } from "#lib/interaction.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { isPanelAction, PANEL_ID } from "#modules/temp-voice/panel.js";
import actions, {
  type ActionContext,
  type Outcome,
} from "#modules/temp-voice/services/actions.service.js";
import lifecycle from "#modules/temp-voice/services/lifecycle.service.js";
import panelService from "#modules/temp-voice/services/panel.service.js";
import store from "#modules/temp-voice/services/store.service.js";
import type {
  TempVoiceConfig,
  TempVoiceConfigSchema,
} from "#modules/temp-voice/temp-voice.config.js";
import {
  deleteConfirmation,
  editModal,
  membersSheet,
  outcomeText,
  transferSelect,
} from "#modules/temp-voice/views.js";

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

async function replaceOutdatedPanel(
  interaction: ButtonInteraction<"cached">,
  channelId: string,
  config: TempVoiceConfig
): Promise<void> {
  await interaction.deferReply(ephemeral);
  const key = await lifecycle.queue.run(channelId, async () => {
    const channel = actions.tempChannelOf(interaction.guild, channelId);
    const row = channel ? await store.channel(channelId) : null;
    if (!channel || row?.panelMessageId !== interaction.message.id) {
      return "panel.stale";
    }
    if (!(await panelService.post(channel, row, config.t))) {
      return "panel.notReplaced";
    }
    await interaction.message.delete().catch(() => undefined);
    return "panel.outdated";
  });
  await interaction.editReply(config.t(key));
}

export default declareInteractionHandler<
  ButtonInteraction,
  TempVoiceConfigSchema
>({
  customId: PANEL_ID,
  access: "everyone",
  check: (interaction): interaction is ButtonInteraction =>
    interaction.isButton(),
  async execute(interaction, [action, channelId, token], config) {
    if (!interaction.inCachedGuild() || !channelId) {
      return;
    }
    const { guild, member: actor } = interaction;
    const t = config.t;

    if (!isPanelAction(action)) {
      await replaceOutdatedPanel(interaction, channelId, config);
      return;
    }

    const answer = (outcome: Outcome) => ({
      content: outcomeText(t, outcome),
      components: [],
      allowedMentions: NO_MENTIONS,
    });

    switch (action) {
      case "claim": {
        await interaction.deferReply(ephemeral);
        const outcome = await actions.withChannel(
          guild,
          channelId,
          actor,
          config,
          (ctx) => actions.claim(ctx),
          { ownerOnly: false }
        );
        await interaction.editReply(answer(outcome)).catch(() => undefined);
        return;
      }
      case "deleteConfirm": {
        await interaction.deferUpdate();
        const outcome = await actions.withChannel(
          guild,
          channelId,
          actor,
          config,
          (ctx) => actions.remove(ctx)
        );
        await interaction.editReply(answer(outcome)).catch(() => undefined);
        return;
      }
      case "notify": {
        await interaction.deferUpdate();
        const members = actions.noticeMembers(guild, token ?? "");
        if (members.length === 0) {
          await interaction.editReply(
            answer({ ok: false, key: "notify.expired" })
          );
          return;
        }
        const checked: { ctx?: ActionContext } = {};
        const refused = await actions.withChannel(
          guild,
          channelId,
          actor,
          config,
          async (ctx) => {
            checked.ctx = { ...ctx, row: { ...ctx.row } };
            return { ok: true, key: "" };
          }
        );
        await interaction.editReply(
          answer(
            checked.ctx ? await actions.notify(checked.ctx, members) : refused
          )
        );
        return;
      }
      case "cancel":
        await interaction.update({
          content: t("delete.cancelled"),
          components: [],
        });
        return;
      default:
        break;
    }

    const authorized = await actions.authorize(guild, channelId, actor);
    if ("key" in authorized) {
      await interaction.reply({
        content: outcomeText(t, authorized),
        ...ephemeral,
      });
      return;
    }
    const { channel, row } = authorized;

    switch (action) {
      case "edit":
        await interaction.showModal(editModal(t, channel));
        return;
      case "members":
        await interaction.reply({
          ...membersSheet(t, guild, channel, row, actor.id),
          allowedMentions: NO_MENTIONS,
          ...ephemeral,
        });
        return;
      case "transfer":
        await interaction.reply({
          ...transferSelect(t, channel, row, actor.id),
          ...ephemeral,
        });
        return;
      case "delete":
        await interaction.reply({
          ...deleteConfirmation(t, channel, channelId, actor.id),
          ...ephemeral,
        });
        return;
      default:
        return;
    }
  },
});
