import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  escapeMarkdown,
  MessageFlags,
  type MessageMentionOptions,
} from "discord.js";
import { formatDuration } from "#lib/duration.js";
import type { TFunction } from "#lib/i18n.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { Action, AuthorHistory, Report, ReportStatus } from "./store.js";

export const CONTENT_LIMIT = 1500;
export const TEXT_LIMIT = 4000;
const EDITED_LIMIT = 600;
const REASON_LIMIT = 200;
const SHOWN_REPORTERS = 10;
const SHOWN_REASONS = 5;
const SHOWN_ACTIONS = 5;

const ACCENTS: Record<ReportStatus, number> = {
  open: 0xd63838,
  resolved: 0x3ba55d,
  dismissed: 0x99aab5,
  abusive: 0xff9900,
};

export type AlertButton =
  | "delete"
  | "warn"
  | "timeout"
  | "kick"
  | "ban"
  | "softban"
  | "dismiss"
  | "abusive"
  | "reopen";

export function alertCustomId(button: AlertButton, reportId: number): string {
  return `report-${button}:${reportId}`;
}

export function messageUrl(
  report: Pick<Report, "guildId" | "channelId" | "messageId">
) {
  return `https://discord.com/channels/${report.guildId}/${report.channelId}/${report.messageId}`;
}

export function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function fitText(texts: string[], limit: number): string[] {
  const result = [...texts];
  const total = () => result.reduce((sum, text) => sum + text.length, 0);
  for (let excess = total() - limit; excess > 0; excess = total() - limit) {
    const longest = result.reduce(
      (best, text, index) =>
        text.length > result[best]!.length ? index : best,
      0
    );
    const length = result[longest]!.length;
    result[longest] = truncate(
      result[longest]!,
      Math.max(length - excess, Math.ceil(length / 2))
    );
  }
  return result;
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function timestamp(date: Date, style: "f" | "R"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function statusLine(report: Report, t: TFunction): string {
  if (report.status === "open") {
    return t("alert.status.open");
  }
  return t(`alert.status.${report.status}`, {
    moderator: report.handledBy ? `<@${report.handledBy}>` : "—",
    when: report.handledAt ? timestamp(report.handledAt, "R") : "",
  });
}

function reportersBlock(report: Report, t: TFunction): string {
  const mentions = report.reporters
    .slice(0, SHOWN_REPORTERS)
    .map((reporter) => `<@${reporter.userId}>`);
  const hidden = report.reporters.length - mentions.length;
  const list =
    mentions.join(", ") +
    (hidden > 0 ? t("alert.moreReporters", { count: hidden }) : "");
  const lines = [
    t("alert.reporters", { count: report.reporters.length, list }),
  ];

  const reasons = report.reporters.filter((reporter) => reporter.reason);
  for (const reporter of reasons.slice(0, SHOWN_REASONS)) {
    lines.push(
      `- <@${reporter.userId}> : ${truncate(escapeMarkdown(reporter.reason!.replace(/\s+/g, " "), { maskedLink: true }), REASON_LIMIT)}`
    );
  }
  if (reasons.length > SHOWN_REASONS) {
    lines.push(
      t("alert.moreReasons", { count: reasons.length - SHOWN_REASONS })
    );
  }
  return lines.join("\n");
}

function actionLine(action: Action, t: TFunction): string {
  const label = t(`action.${action.action}`, {
    duration: action.duration ? formatDuration(action.duration) : "",
  });
  const reason = action.reason
    ? ` — ${truncate(action.reason.replace(/\s+/g, " "), REASON_LIMIT)}`
    : "";
  const failed = action.failed ? ` ${t("alert.actionFailed")}` : "";
  return `- ${timestamp(action.createdAt, "f")} <@${action.moderatorId}> : ${label}${reason}${failed}`;
}

function contentBlock(report: Report, t: TFunction): string {
  const lines: string[] = [];
  lines.push(
    report.content
      ? quote(truncate(report.content, CONTENT_LIMIT))
      : t("alert.noContent")
  );
  if (report.attachments.length > 0) {
    lines.push(
      t("alert.attachments", {
        list: report.attachments
          .map(
            (attachment) =>
              `[${attachment.name.replace(/[[\]]/g, "")}](${attachment.url})`
          )
          .join(", "),
      })
    );
  }
  return lines.join("\n");
}

function notes(report: Report, t: TFunction): string[] {
  const result: string[] = [];
  if (report.messageState === "edited") {
    result.push(t("alert.note.edited"));
    if (report.editedContent !== null) {
      result.push(
        report.editedContent
          ? quote(truncate(report.editedContent, EDITED_LIMIT))
          : t("alert.noContent")
      );
    }
  }
  if (report.messageState === "deleted") {
    result.push(t("alert.note.deleted"));
  }
  if (report.reactionKept) {
    result.push(t("alert.note.reactionKept"));
  }
  return result;
}

function button(
  id: AlertButton,
  reportId: number,
  label: string,
  style: ButtonStyle,
  disabled = false
) {
  return new ButtonBuilder()
    .setCustomId(alertCustomId(id, reportId))
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

function actionRows(report: Report, t: TFunction) {
  const deleteButton = button(
    "delete",
    report.id,
    t("button.delete"),
    ButtonStyle.Secondary,
    report.messageState === "deleted"
  );

  if (report.status !== "open") {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        deleteButton,
        button("reopen", report.id, t("button.reopen"), ButtonStyle.Secondary)
      ),
    ];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      deleteButton,
      button("warn", report.id, t("button.warn"), ButtonStyle.Primary),
      button("timeout", report.id, t("button.timeout"), ButtonStyle.Primary),
      button("kick", report.id, t("button.kick"), ButtonStyle.Danger),
      button("ban", report.id, t("button.ban"), ButtonStyle.Danger)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("softban", report.id, t("button.softban"), ButtonStyle.Danger),
      button("dismiss", report.id, t("button.dismiss"), ButtonStyle.Success),
      button("abusive", report.id, t("button.abusive"), ButtonStyle.Secondary)
    ),
  ];
}

export interface AlertOptions {
  t: TFunction;
  history: AuthorHistory;
  moderatorRoleId?: string | null;
}

export function alertMessage(report: Report, options: AlertOptions) {
  const { t, history, moderatorRoleId } = options;
  const blocks: { content: string; divider: boolean }[] = [];

  if (moderatorRoleId) {
    blocks.push({ content: `<@&${moderatorRoleId}>`, divider: false });
  }

  const header = [
    t("alert.title", { id: report.id }),
    statusLine(report, t),
  ].join("\n");

  const details = [
    t("alert.author", { author: `<@${report.authorId}>`, id: report.authorId }),
    t("alert.channel", {
      channel: `<#${report.channelId}>`,
      url: messageUrl(report),
    }),
    t("alert.sent", { when: timestamp(report.messageCreatedAt, "f") }),
    reportersBlock(report, t),
    history.total > 0
      ? t("alert.history", {
          count: history.total,
          sanctioned: history.sanctioned,
        })
      : t("alert.noHistory"),
  ].join("\n");

  blocks.push(
    { content: header, divider: false },
    { content: details, divider: false },
    { content: contentBlock(report, t), divider: true }
  );

  const extra = notes(report, t);
  if (extra.length > 0) {
    blocks.push({ content: extra.join("\n"), divider: false });
  }

  if (report.actions.length > 0) {
    const shown = report.actions.slice(-SHOWN_ACTIONS);
    const lines = shown.map((action) => actionLine(action, t));
    if (report.actions.length > shown.length) {
      lines.unshift(
        t("alert.olderActions", { count: report.actions.length - shown.length })
      );
    }
    blocks.push({
      content: [t("alert.log"), ...lines].join("\n"),
      divider: true,
    });
  }

  const contents = fitText(
    blocks.map((block) => block.content),
    TEXT_LIMIT
  );
  const container = new ContainerBuilder().setAccentColor(
    ACCENTS[report.status]
  );
  blocks.forEach((block, index) => {
    if (block.divider) {
      container.addSeparatorComponents((separator) =>
        separator.setDivider(true)
      );
    }
    container.addTextDisplayComponents((text) =>
      text.setContent(contents[index]!)
    );
  });

  container.addActionRowComponents(...actionRows(report, t));

  const allowedMentions: MessageMentionOptions = {
    parse: [],
    roles: moderatorRoleId ? [moderatorRoleId] : [],
  };

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions,
  };
}

export function purgedMessage(reportId: number, t: TFunction) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENTS.dismissed)
    .addTextDisplayComponents((text) =>
      text.setContent(t("alert.purged", { id: reportId }))
    );
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: NO_MENTIONS,
  };
}
