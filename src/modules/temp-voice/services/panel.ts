import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  escapeMarkdown,
  MessageFlags,
  StringSelectMenuBuilder,
  type VoiceBasedChannel,
} from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import { Colors } from "#utils/colors.js";
import { ACCESS_MODES, accessMode, type AccessMode } from "./access-mode.js";
import store, { type TempChannel } from "./store.js";

const logger = loggerMaker("temp-voice");

export const PANEL_ID = "tempvoice";
export const ACCESS_ID = "tempvoice-access";
export const MODAL_ID = "tempvoice-modal";
export const USERS_ID = "tempvoice-users";
export const PICK_ID = "tempvoice-pick";

export const PANEL_ACTIONS = [
  "edit",
  "members",
  "transfer",
  "delete",
  "deleteConfirm",
  "cancel",
  "claim",
  "notify",
] as const;

export type PanelAction = (typeof PANEL_ACTIONS)[number];

export const MODE_EMOJIS: Record<AccessMode, string> = {
  open: "🔓",
  invite: "🔒",
  private: "🙈",
};

export function isPanelAction(value: string | undefined): value is PanelAction {
  return (PANEL_ACTIONS as readonly string[]).includes(value ?? "");
}

export function panelButton(
  t: TFunction,
  channelId: string,
  action: PanelAction,
  emoji: string,
  style = ButtonStyle.Secondary,
  suffix = ""
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${PANEL_ID}:${action}:${channelId}${suffix}`)
    .setLabel(t(`panel.button.${action}`))
    .setEmoji(emoji)
    .setStyle(style);
}

function header(
  row: TempChannel,
  channel: VoiceBasedChannel,
  mode: AccessMode,
  t: TFunction
): string {
  const status = [
    `${MODE_EMOJIS[mode]} **${t(`mode.${mode}.label`)}**`,
    channel.userLimit > 0
      ? t("panel.limit", { limit: String(channel.userLimit) })
      : t("panel.noLimit"),
    t("panel.invited", { count: String(row.trusted.length) }),
    t("panel.blocked", { count: String(row.blocked.length) }),
  ].join(" · ");
  return [
    `## ${escapeMarkdown(channel.name)}`,
    status,
    t("panel.owner", { owner: `<@${row.ownerId}>` }),
  ].join("\n");
}

export function panelMessage(
  row: TempChannel,
  channel: VoiceBasedChannel,
  t: TFunction,
  ownerPresent = channel.members.has(row.ownerId)
) {
  const id = row.channelId;
  const mode = accessMode(row);
  const container = new ContainerBuilder().setAccentColor(Colors.SkyBlue);

  container.addTextDisplayComponents((text) =>
    text.setContent(header(row, channel, mode, t))
  );
  if (!ownerPresent) {
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(t("panel.ownerAway", { owner: `<@${row.ownerId}>` }))
        )
        .setButtonAccessory(
          panelButton(t, id, "claim", "👑", ButtonStyle.Success)
        )
    );
  }
  container.addSeparatorComponents((separator) => separator.setDivider(true));

  container.addTextDisplayComponents((text) =>
    text.setContent(t("panel.accessTitle"))
  );
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${ACCESS_ID}:${id}`)
        .addOptions(
          ACCESS_MODES.map((option) => ({
            label: t(`mode.${option}.label`),
            description: t(`mode.${option}.description`),
            emoji: MODE_EMOJIS[option],
            value: option,
            default: option === mode,
          }))
        )
    )
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      panelButton(t, id, "edit", "✏️"),
      panelButton(t, id, "members", "👥"),
      panelButton(t, id, "transfer", "🔁"),
      panelButton(t, id, "delete", "🗑️", ButtonStyle.Danger)
    )
  );
  container.addTextDisplayComponents((text) =>
    text.setContent(t("panel.footer"))
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: NO_MENTIONS,
  };
}

export async function postPanel(
  channel: VoiceBasedChannel,
  row: TempChannel,
  t: TFunction,
  ownerPresent?: boolean
): Promise<boolean> {
  try {
    const message = await channel.send(
      panelMessage(row, channel, t, ownerPresent)
    );
    await store.updateChannel(row.channelId, { panelMessageId: message.id });
    return true;
  } catch (err) {
    logger.warn({ err }, `Panel not posted | channelId = ${channel.id}`);
    return false;
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
    await channel.messages.edit(row.panelMessageId, {
      ...panelMessage(row, channel, t),
      embeds: [],
    });
  } catch (err) {
    logger.debug({ err }, `Panel not refreshed | channelId = ${channel.id}`);
  }
}
