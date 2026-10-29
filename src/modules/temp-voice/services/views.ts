import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonBuilder,
  type Guild,
  type VoiceBasedChannel,
} from "discord.js";
import { MAX_SELECT_VALUES } from "#lib/config.js";
import type { TFunction } from "#lib/i18n.js";
import type { Outcome } from "./actions.js";
import { CHANNEL_NAME_MAX } from "./naming.js";
import { MODAL_ID, panelButton, PICK_ID, USERS_ID } from "./panel.js";
import type { TempChannel } from "./store.js";

export type UserAction = "trust" | "block";
export type PresentAction = "kick" | "transfer";

const MAX_USERS_PER_SELECT = 10;

export function outcomeText(t: TFunction, outcome: Outcome): string {
  return t(outcome.key, outcome.params);
}

const MAX_LISTED_MENTIONS = 20;

function mentionList(t: TFunction, ids: string[]): string {
  if (ids.length === 0) {
    return t("members.nobody");
  }
  const shown = ids
    .slice(0, MAX_LISTED_MENTIONS)
    .map((id) => `<@${id}>`)
    .join(", ");
  return ids.length > MAX_LISTED_MENTIONS
    ? `${shown} ${t("members.more", { count: String(ids.length - MAX_LISTED_MENTIONS) })}`
    : shown;
}

export function editModal(t: TFunction, channel: VoiceBasedChannel) {
  return new ModalBuilder()
    .setCustomId(`${MODAL_ID}:edit:${channel.id}`)
    .setTitle(t("modal.edit.title"))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel(t("modal.edit.name"))
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(CHANNEL_NAME_MAX)
          .setValue(channel.name.slice(0, CHANNEL_NAME_MAX))
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("limit")
          .setLabel(t("modal.edit.limit"))
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setValue(String(channel.userLimit))
          .setRequired(true)
      )
    );
}

function userSelect(t: TFunction, action: UserAction, channelId: string) {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`${USERS_ID}:${action}:${channelId}`)
      .setPlaceholder(t(`members.${action}`))
      .setMinValues(1)
      .setMaxValues(MAX_USERS_PER_SELECT)
  );
}

function presentMenu(
  t: TFunction,
  action: PresentAction,
  channel: VoiceBasedChannel,
  row: TempChannel,
  actorId: string
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const members = [...channel.members.values()]
    .filter(
      (member) =>
        !member.user.bot && member.id !== row.ownerId && member.id !== actorId
    )
    .slice(0, MAX_SELECT_VALUES);
  if (members.length === 0) {
    return null;
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${PICK_ID}:${action}:${row.channelId}`)
      .setPlaceholder(t(`members.${action}`))
      .setMinValues(1)
      .setMaxValues(action === "kick" ? members.length : 1)
      .addOptions(
        members.map((member) => ({
          label: member.displayName.slice(0, 100),
          description: member.user.username.slice(0, 100),
          value: member.id,
        }))
      )
  );
}

function revokeMenu(
  t: TFunction,
  guild: Guild,
  row: TempChannel
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const entries = [
    ...row.trusted.map((id) => ({ id, kind: "trusted" })),
    ...row.blocked.map((id) => ({ id, kind: "blocked" })),
  ].slice(0, MAX_SELECT_VALUES);
  if (entries.length === 0) {
    return null;
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${PICK_ID}:untrust:${row.channelId}`)
      .setPlaceholder(t("members.untrust"))
      .setMinValues(1)
      .setMaxValues(entries.length)
      .addOptions(
        entries.map(({ id, kind }) => {
          const member = guild.members.cache.get(id);
          return {
            label: (member?.displayName ?? id).slice(0, 100),
            description: t(`revoke.kind.${kind}`),
            value: id,
          };
        })
      )
  );
}

export function membersSheet(
  t: TFunction,
  guild: Guild,
  channel: VoiceBasedChannel,
  row: TempChannel,
  actorId: string
) {
  const present = [...channel.members.values()]
    .filter((member) => !member.user.bot)
    .map((member) => member.id);
  const content = [
    t("members.title"),
    t("members.present", { users: mentionList(t, present) }),
    t("members.trusted", { users: mentionList(t, row.trusted) }),
    t("members.blocked", { users: mentionList(t, row.blocked) }),
  ].join("\n");
  const components = [
    userSelect(t, "trust", row.channelId),
    userSelect(t, "block", row.channelId),
    presentMenu(t, "kick", channel, row, actorId),
    revokeMenu(t, guild, row),
  ].filter((component) => component !== null);
  return { content, components };
}

export function transferSelect(
  t: TFunction,
  channel: VoiceBasedChannel,
  row: TempChannel,
  actorId: string
) {
  const menu = presentMenu(t, "transfer", channel, row, actorId);
  return menu
    ? { content: t("select.transfer"), components: [menu] }
    : { content: t("transfer.empty"), components: [] };
}

export function deleteConfirmation(
  t: TFunction,
  channel: VoiceBasedChannel,
  channelId: string,
  actorId: string
) {
  return {
    content: t("delete.confirm", {
      name: channel.name,
      count: String(
        channel.members.filter((m) => !m.user.bot && m.id !== actorId).size
      ),
    }),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        panelButton(t, channelId, "deleteConfirm", "🗑️", ButtonStyle.Danger),
        panelButton(t, channelId, "cancel", "✖️")
      ),
    ],
  };
}

export function notifyRow(t: TFunction, channelId: string, token: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    panelButton(t, channelId, "notify", "📨", ButtonStyle.Primary, `:${token}`)
  );
}
