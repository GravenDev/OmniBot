import type { Guild } from "discord.js";
import type { TFunction } from "#lib/i18n.js";
import { dayOf, RETENTION_DAYS } from "./day.js";
import { compare, NO_INSIGHTS, previousDays } from "./insights.js";
import type { Selection } from "./period.js";
import { renderReport, type Report, type ReportContext } from "./report.js";
import store, { TOP_SIZE, type DailyStats, type Totals } from "./store.js";

export interface ViewOptions {
  now: Date;
  channelShown: (channelId: string) => boolean;
  showTopMembers: boolean;
  t: TFunction;
  locale: string;
}

async function comparison(
  guildId: string,
  day: Date,
  stats: DailyStats
): Promise<Pick<ReportContext, "insights" | "comparedDays">> {
  const days = previousDays(day, stats.startedAt, RETENTION_DAYS);
  const history =
    days.length > 0
      ? await store.history(guildId, days.at(-1)!, days[0]!)
      : new Map<number, Totals>();
  const previous = days.flatMap((previousDay) => {
    const totals = history.get(previousDay.getTime());
    return totals ? [totals] : [];
  });
  return { insights: compare(stats, previous), comparedDays: previous.length };
}

// The report of one day, or of several added up. Only a past day is compared
// with the days before it: the live counters of a day still going would be
// set against whole days, and the sums of several days against single ones.
export async function statsReport(
  guild: Guild,
  { from, to }: Selection,
  { now, channelShown, showTopMembers, t, locale }: ViewOptions
): Promise<Report | null> {
  const single = from.getTime() === to.getTime();
  const counted = single
    ? await store.dailyStats(guild.id, from)
    : await store.periodStats(guild.id, from, to);
  if (!counted) {
    return null;
  }
  // Their messages stay in the totals; only their names are left out.
  const stats = {
    ...counted,
    topChannels: counted.topChannels
      .filter((channel) => channelShown(channel.id))
      .slice(0, TOP_SIZE),
  };
  const going = to.getTime() === dayOf(now).getTime();
  return renderReport(guild, stats, {
    day: from,
    lastDay: to,
    until: going ? now : null,
    ...(single && !going
      ? await comparison(guild.id, from, stats)
      : { insights: NO_INSIGHTS, comparedDays: 0 }),
    showTopMembers,
    t,
    locale,
  });
}
