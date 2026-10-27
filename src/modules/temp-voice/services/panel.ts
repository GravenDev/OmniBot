import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type VoiceBasedChannel,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { Colors } from "#utils/colors.js";
import store, { type TempChannel } from "./store.js";

const logger = loggerMaker("temp-voice");

export const PANEL_ID = "tempvoice";
export const MODAL_ID = "tempvoice-modal";
export const USERS_ID = "tempvoice-users";
export const PICK_ID = "tempvoice-pick";

export const PANEL_ACTIONS = [
  "rename",
  "limit",
  "lock",
  "unlock",
  "hide",
  "show",
  "trust",
  "invite",
  "block",
  "untrust",
  "kick",
  "claim",
  "transfer",
  "delete",
] as const;

export type PanelAction = (typeof PANEL_ACTIONS)[number];

export function isPanelAction(value: string | undefined): value is PanelAction {
  return (PANEL_ACTIONS as readonly string[]).includes(value ?? "");
}

function button(
  t: TFunction,
  channelId: string,
  action: PanelAction,
  emoji: string,
  style = ButtonStyle.Secondary
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${PANEL_ID}:${action}:${channelId}`)
    .setLabel(t(`panel.button.${action}`))
    .setEmoji(emoji)
    .setStyle(style);
}

export function panelMessage(
  row: TempChannel,
  channel: VoiceBasedChannel,
  t: TFunction
) {
  const id = row.channelId;
  const embed = new EmbedBuilder()
    .setColor(Colors.SkyBlue)
    .setTitle(t("panel.title"))
    .setDescription(t("panel.description"))
    .addFields(
      { name: t("panel.owner"), value: `<@${row.ownerId}>`, inline: true },
      {
        name: t("panel.access"),
        value: [
          t(row.locked ? "panel.locked" : "panel.unlocked"),
          t(row.hidden ? "panel.hidden" : "panel.visible"),
        ].join("\n"),
        inline: true,
      },
      {
        name: t("panel.limit"),
        value:
          channel.userLimit > 0
            ? String(channel.userLimit)
            : t("panel.noLimit"),
        inline: true,
      },
      {
        name: t("panel.trusted"),
        value: String(row.trusted.length),
        inline: true,
      },
      {
        name: t("panel.blocked"),
        value: String(row.blocked.length),
        inline: true,
      }
    );

  const components = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(t, id, "rename", "✏️"),
      button(t, id, "limit", "👥"),
      row.locked ? button(t, id, "unlock", "🔓") : button(t, id, "lock", "🔒"),
      row.hidden ? button(t, id, "show", "👁️") : button(t, id, "hide", "🙈")
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(t, id, "trust", "✅"),
      button(t, id, "invite", "📨"),
      button(t, id, "untrust", "↩️"),
      button(t, id, "block", "⛔"),
      button(t, id, "kick", "👢")
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(t, id, "claim", "👑"),
      button(t, id, "transfer", "🔁"),
      button(t, id, "delete", "🗑️", ButtonStyle.Danger)
    ),
  ];

  return { embeds: [embed], components, allowedMentions: NO_MENTIONS };
}

export async function postPanel(
  channel: VoiceBasedChannel,
  row: TempChannel,
  t: TFunction
): Promise<void> {
  try {
    const message = await channel.send(panelMessage(row, channel, t));
    await store.updateChannel(row.channelId, { panelMessageId: message.id });
  } catch (err) {
    logger.warn({ err }, `Panel not posted | channelId = ${channel.id}`);
  }
}

export async function refreshPanel(
  channel: VoiceBasedChannel,
  row: TempChannel,
  t: TFunction
): Promise<void> {
  if (!row.panelMessageId) {
    return;
  }
  try {
    await channel.messages.edit(
      row.panelMessageId,
      panelMessage(row, channel, t)
    );
  } catch (err) {
    logger.debug({ err }, `Panel not refreshed | channelId = ${channel.id}`);
  }
}
