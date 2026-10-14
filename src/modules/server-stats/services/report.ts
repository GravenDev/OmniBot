import { EmbedBuilder } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import type { DailyStats, Ranked } from "./store.js";

const COLOR = 0x5865f2;

export interface ReportContext {
  day: Date;
  memberCount: number;
  showTopMembers: boolean;
  t: TFunction;
  locale: string;
}

function ranking(
  entries: Ranked[],
  label: (id: string) => string,
  format: (value: number) => string
): string {
  if (entries.length === 0) {
    return "—";
  }
  return entries
    .map((entry) => `**${format(entry.count)}** · ${label(entry.id)}`)
    .join("\n");
}

export function reportEmbed(
  stats: DailyStats,
  context: ReportContext
): EmbedBuilder {
  const { t, locale } = context;
  const number = new Intl.NumberFormat(locale);
  const format = (value: number) => number.format(value);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(context.day);
  const startedAt = Math.floor(stats.startedAt.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(t("report.title", { date }))
    .setDescription(t("report.since", { since: `<t:${startedAt}:R>` }))
    .addFields(
      {
        name: t("report.memberCount"),
        value: format(context.memberCount),
        inline: true,
      },
      { name: t("report.joins"), value: format(stats.joins), inline: true },
      { name: t("report.leaves"), value: format(stats.leaves), inline: true },
      {
        name: t("report.messages"),
        value: format(stats.messages),
        inline: true,
      },
      {
        name: t("report.activeMembers"),
        value: format(stats.activeMembers),
        inline: true,
      },
      {
        name: t("report.activeChannels"),
        value: format(stats.activeChannels),
        inline: true,
      },
      {
        name: t("report.reactions"),
        value: format(stats.reactions),
        inline: true,
      },
      {
        name: t("report.topReactions"),
        value: ranking(stats.topReactions, (emoji) => emoji, format),
        inline: true,
      },
      {
        name: t("report.topChannels"),
        value: ranking(stats.topChannels, (id) => `<#${id}>`, format),
        inline: true,
      }
    );
  if (context.showTopMembers) {
    embed.addFields({
      name: t("report.topMembers"),
      value: ranking(stats.topMembers, (id) => `<@${id}>`, format),
    });
  }
  return embed;
}
