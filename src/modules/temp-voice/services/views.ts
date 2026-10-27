import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type Guild,
  type VoiceBasedChannel,
} from "discord.js";
import { MAX_SELECT_VALUES } from "#lib/config.js";
import type { TFunction } from "#lib/i18n.js";
import type { Outcome } from "./actions.js";
import { CHANNEL_NAME_MAX } from "./naming.js";
import { MODAL_ID, PICK_ID, USERS_ID } from "./panel.js";
import type { TempChannel } from "./store.js";

export type UserAction = "trust" | "invite" | "block";
export type PresentAction = "kick" | "transfer";

const SINGLE_USER_ACTIONS: readonly UserAction[] = ["invite"];
const MAX_USERS_PER_SELECT = 10;

export function outcomeText(t: TFunction, outcome: Outcome): string {
  return t(outcome.key, outcome.params);
}

export function renameModal(t: TFunction, channelId: string, current: string) {
  return new ModalBuilder()
    .setCustomId(`${MODAL_ID}:rename:${channelId}`)
    .setTitle(t("modal.rename.title"))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(t("modal.rename.label"))
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(CHANNEL_NAME_MAX)
          .setValue(current.slice(0, CHANNEL_NAME_MAX))
          .setRequired(true)
      )
    );
}

export function limitModal(t: TFunction, channelId: string, current: number) {
  return new ModalBuilder()
    .setCustomId(`${MODAL_ID}:limit:${channelId}`)
    .setTitle(t("modal.limit.title"))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(t("modal.limit.label"))
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setValue(String(current))
          .setRequired(true)
      )
    );
}

export function userSelect(
  t: TFunction,
  action: UserAction,
  channelId: string
) {
  const max = SINGLE_USER_ACTIONS.includes(action) ? 1 : MAX_USERS_PER_SELECT;
  return {
    content: t(`select.${action}`),
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`${USERS_ID}:${action}:${channelId}`)
          .setPlaceholder(t("select.placeholder"))
          .setMinValues(1)
          .setMaxValues(max)
      ),
    ],
  };
}

export function presentSelect(
  t: TFunction,
  action: PresentAction,
  channel: VoiceBasedChannel,
  row: TempChannel,
  actorId: string
): {
  content: string;
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
} | null {
  const members = [...channel.members.values()]
    .filter(
      (member) =>
        !member.user.bot && member.id !== row.ownerId && member.id !== actorId
    )
    .slice(0, MAX_SELECT_VALUES);
  if (members.length === 0) {
    return null;
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${PICK_ID}:${action}:${row.channelId}`)
    .setPlaceholder(t("select.placeholder"))
    .setMinValues(1)
    .setMaxValues(action === "kick" ? members.length : 1)
    .addOptions(
      members.map((member) => ({
        label: member.displayName.slice(0, 100),
        description: member.user.username.slice(0, 100),
        value: member.id,
      }))
    );
  return {
    content: t(`select.${action}`),
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    ],
  };
}

export function revokeSelect(
  t: TFunction,
  guild: Guild,
  row: TempChannel
): {
  content: string;
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
} | null {
  const entries = [
    ...row.trusted.map((id) => ({ id, kind: "trusted" })),
    ...row.blocked.map((id) => ({ id, kind: "blocked" })),
  ].slice(0, MAX_SELECT_VALUES);
  if (entries.length === 0) {
    return null;
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${PICK_ID}:untrust:${row.channelId}`)
    .setPlaceholder(t("select.placeholder"))
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
    );
  return {
    content: t("select.untrust"),
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    ],
  };
}
