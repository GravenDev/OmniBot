import type { Guild } from "discord.js";
import { formatPercentage } from "#lib/format.js";
import type { TFunction } from "#lib/i18n.js";
import { fetchImage } from "#lib/imaging.js";
import { resolvePlayers } from "#lib/players.js";
import {
  type BoxNote,
  type MemberEntry,
  type NotedBox,
  type ReactionEntry,
  renderReportCard,
} from "#modules/server-stats/rendering/report-card.js";
import { dayOf, TIMEZONE } from "./day.js";
import type { Insights, Metric } from "./insights.js";
import type { DailyStats, Ranked } from "./store.js";

const CUSTOM_EMOJI = /^<a?:e:(\d+)>$/;

export interface ReportContext {
  day: Date;
  insights: Insights;
  comparedDays: number;
  showTopMembers: boolean;
  t: TFunction;
  locale: string;
}

export interface Report {
  content: string;
  image: Buffer;
}

async function reactionEntry({ id, count }: Ranked): Promise<ReactionEntry> {
  const custom = CUSTOM_EMOJI.exec(id);
  if (!custom) {
    return { text: id, image: null, count };
  }
  const image = await fetchImage(
    `https://cdn.discordapp.com/emojis/${custom[1]}.png?size=64`
  );
  return { text: "?", image, count };
}

async function memberEntries(
  guild: Guild,
  members: Ranked[],
  unknown: string
): Promise<MemberEntry[]> {
  const players = await resolvePlayers(
    guild.client,
    guild.id,
    members.map((member) => member.id)
  );
  return members.map(({ id, count }, index) => ({
    rank: index + 1,
    name: players.get(id)?.name ?? unknown,
    avatar: players.get(id)?.avatar ?? null,
    count,
  }));
}

function subtitle(stats: DailyStats, context: ReportContext, date: string) {
  if (dayOf(stats.startedAt).getTime() !== context.day.getTime()) {
    return date;
  }
  const time = new Intl.DateTimeFormat(context.locale, {
    timeStyle: "short",
    timeZone: TIMEZONE,
  }).format(stats.startedAt);
  return `${date} · ${context.t("report.since", { time })}`;
}

function notes(
  stats: DailyStats,
  complete: boolean,
  { insights, comparedDays, t, locale }: ReportContext
): Record<NotedBox, BoxNote> {
  const note = (
    metric: Metric,
    { trend = true, extra }: { trend?: boolean; extra?: string } = {}
  ): BoxNote => {
    const { change, record } = insights[metric];
    const percent = change === null ? 0 : Math.round(change * 100);
    const subtexts = [
      extra,
      record ? t("report.record", { count: comparedDays }) : undefined,
    ].filter((text) => text !== undefined);
    return {
      trend:
        trend && percent !== 0
          ? {
              text: t("report.trend", {
                change: `${percent > 0 ? "+" : ""}${formatPercentage(percent, locale)}`,
              }),
              direction: percent > 0 ? "up" : "down",
            }
          : undefined,
      subtext: subtexts.length > 0 ? subtexts.join(" · ") : undefined,
      record,
    };
  };
  return {
    joins: note("joins", {
      trend: false,
      ...(complete && stats.joins > 0
        ? {
            extra: t("report.activeNewcomers", {
              count: stats.activeNewcomers,
            }),
          }
        : {}),
    }),
    messages: note("messages"),
    activeMembers: note("activeMembers"),
    reactions: note("reactions"),
  };
}

export async function renderReport(
  guild: Guild,
  stats: DailyStats,
  context: ReportContext
): Promise<Report> {
  const { t, locale } = context;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(context.day);
  const complete =
    stats.hours.reduce((sum, count) => sum + count, 0) === stats.messages;

  const [icon, topReactions, topMembers] = await Promise.all([
    fetchImage(guild.iconURL({ extension: "png", size: 256 })),
    Promise.all(stats.topReactions.map(reactionEntry)),
    context.showTopMembers
      ? memberEntries(guild, stats.topMembers, t("report.unknownMember"))
      : null,
  ]);

  const image = await renderReportCard(
    {
      icon,
      memberCount: guild.memberCount,
      joins: stats.joins,
      leaves: stats.leaves,
      messages: stats.messages,
      activeMembers: stats.activeMembers,
      activeChannels: stats.activeChannels,
      reactions: stats.reactions,
      topChannels: stats.topChannels.map(({ id, count }) => ({
        name: guild.channels.cache.get(id)?.name ?? t("report.deletedChannel"),
        count,
      })),
      topReactions,
      topMembers,
      hours: complete ? stats.hours : stats.hours.map(() => 0),
      notes: notes(stats, complete, context),
    },
    {
      locale,
      title: t("report.title"),
      subtitle: subtitle(stats, context, date),
      memberCount: t("report.memberCount"),
      joins: t("report.joins"),
      leaves: t("report.leaves"),
      messages: t("report.messages"),
      activeMembers: t("report.activeMembers"),
      reactions: t("report.reactions"),
      topChannels: (count) => t("report.topChannels", { count }),
      hours: t("report.hours"),
      peak: (hour) => t("report.peak", { hour }),
      hour: (hour) => t("report.hour", { hour }),
      topReactions: t("report.topReactions"),
      topMembers: t("report.topMembers"),
      rank: t("report.rank"),
      member: t("report.member"),
      messagesHeader: t("report.messagesHeader"),
    }
  );
  return { content: t("report.message", { date }), image };
}
