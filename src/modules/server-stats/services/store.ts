import prisma from "#lib/database.js";

export const TOP_SIZE = 5;

export interface Ranked {
  id: string;
  count: number;
}

export interface Totals {
  joins: number;
  messages: number;
  activeMembers: number;
  reactions: number;
}

export interface DailyStats {
  startedAt: Date;
  joins: number;
  activeNewcomers: number;
  hours: number[];
  leaves: number;
  messages: number;
  activeMembers: number;
  activeChannels: number;
  reactions: number;
  topChannels: Ranked[];
  topMembers: Ranked[];
  topReactions: Ranked[];
}

const startedGuilds = new Set<string>();

async function ensureStarted(guildId: string): Promise<void> {
  if (startedGuilds.has(guildId)) {
    return;
  }
  await prisma.serverStatsGuild.createMany({
    data: [{ guildId }],
    skipDuplicates: true,
  });
  startedGuilds.add(guildId);
}

async function recordMessage(
  guildId: string,
  day: Date,
  hour: number,
  channelId: string,
  userId: string,
  newcomer: boolean
): Promise<void> {
  await ensureStarted(guildId);
  const [, , member] = await prisma.$transaction([
    prisma.serverStatsHour.upsert({
      where: { guildId_day_hour: { guildId, day, hour } },
      create: { guildId, day, hour, messages: 1 },
      update: { messages: { increment: 1 } },
    }),
    prisma.serverStatsChannel.upsert({
      where: { guildId_day_channelId: { guildId, day, channelId } },
      create: { guildId, day, channelId, messages: 1 },
      update: { messages: { increment: 1 } },
    }),
    prisma.serverStatsMember.upsert({
      where: { guildId_day_userId: { guildId, day, userId } },
      create: { guildId, day, userId, messages: 1 },
      update: { messages: { increment: 1 } },
    }),
  ]);
  if (newcomer && member.messages === 1) {
    await prisma.serverStatsDay.upsert({
      where: { guildId_day: { guildId, day } },
      create: { guildId, day, activeNewcomers: 1 },
      update: { activeNewcomers: { increment: 1 } },
    });
  }
}

async function recordReaction(
  guildId: string,
  day: Date,
  emoji: string
): Promise<void> {
  await ensureStarted(guildId);
  await prisma.serverStatsReaction.upsert({
    where: { guildId_day_emoji: { guildId, day, emoji } },
    create: { guildId, day, emoji, reactions: 1 },
    update: { reactions: { increment: 1 } },
  });
}

async function recordMemberChange(
  guildId: string,
  day: Date,
  change: "joins" | "leaves"
): Promise<void> {
  await ensureStarted(guildId);
  await prisma.serverStatsDay.upsert({
    where: { guildId_day: { guildId, day } },
    create: { guildId, day, [change]: 1 },
    update: { [change]: { increment: 1 } },
  });
}

async function history(
  guildId: string,
  from: Date,
  to: Date
): Promise<Map<number, Totals>> {
  const where = { guildId, day: { gte: from, lte: to } };
  const [days, channels, members, reactions] = await Promise.all([
    prisma.serverStatsDay.findMany({ where }),
    prisma.serverStatsChannel.groupBy({
      by: ["day"],
      where,
      _sum: { messages: true },
    }),
    prisma.serverStatsMember.groupBy({ by: ["day"], where, _count: true }),
    prisma.serverStatsReaction.groupBy({
      by: ["day"],
      where,
      _sum: { reactions: true },
    }),
  ]);
  const totals = new Map<number, Totals>();
  const at = (day: Date) => {
    let entry = totals.get(day.getTime());
    if (!entry) {
      entry = { joins: 0, messages: 0, activeMembers: 0, reactions: 0 };
      totals.set(day.getTime(), entry);
    }
    return entry;
  };
  for (const row of days) {
    at(row.day).joins = row.joins;
  }
  for (const row of channels) {
    at(row.day).messages = row._sum.messages ?? 0;
  }
  for (const row of members) {
    at(row.day).activeMembers = row._count;
  }
  for (const row of reactions) {
    at(row.day).reactions = row._sum.reactions ?? 0;
  }
  return totals;
}

async function dailyStats(
  guildId: string,
  day: Date
): Promise<DailyStats | null> {
  const guild = await prisma.serverStatsGuild.findUnique({
    where: { guildId },
  });
  if (!guild) {
    return null;
  }

  const where = { guildId, day };
  const [
    dayRow,
    channelTotals,
    channels,
    memberCount,
    members,
    reactionTotals,
    reactions,
    hourRows,
  ] = await prisma.$transaction(
    [
      prisma.serverStatsDay.findUnique({ where: { guildId_day: where } }),
      prisma.serverStatsChannel.aggregate({
        where,
        _sum: { messages: true },
        _count: true,
      }),
      prisma.serverStatsChannel.findMany({
        where,
        orderBy: [{ messages: "desc" }, { channelId: "asc" }],
        take: TOP_SIZE,
      }),
      prisma.serverStatsMember.count({ where }),
      prisma.serverStatsMember.findMany({
        where,
        orderBy: [{ messages: "desc" }, { userId: "asc" }],
        take: TOP_SIZE,
      }),
      prisma.serverStatsReaction.aggregate({
        where,
        _sum: { reactions: true },
      }),
      prisma.serverStatsReaction.findMany({
        where,
        orderBy: [{ reactions: "desc" }, { emoji: "asc" }],
        take: TOP_SIZE,
      }),
      prisma.serverStatsHour.findMany({ where }),
    ],
    { isolationLevel: "RepeatableRead" }
  );
  const hours = Array.from({ length: 24 }, () => 0);
  for (const row of hourRows) {
    hours[row.hour] = row.messages;
  }

  return {
    startedAt: guild.startedAt,
    joins: dayRow?.joins ?? 0,
    activeNewcomers: dayRow?.activeNewcomers ?? 0,
    hours,
    leaves: dayRow?.leaves ?? 0,
    messages: channelTotals._sum.messages ?? 0,
    activeChannels: channelTotals._count,
    activeMembers: memberCount,
    reactions: reactionTotals._sum.reactions ?? 0,
    topChannels: channels.map((row) => ({
      id: row.channelId,
      count: row.messages,
    })),
    topMembers: members.map((row) => ({ id: row.userId, count: row.messages })),
    topReactions: reactions.map((row) => ({
      id: row.emoji,
      count: row.reactions,
    })),
  };
}

function ranked<Row>(rows: Row[], entry: (row: Row) => Ranked): Ranked[] {
  return rows
    .map(entry)
    .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
}

async function startedAt(guildId: string): Promise<Date | null> {
  const guild = await prisma.serverStatsGuild.findUnique({
    where: { guildId },
  });
  return guild?.startedAt ?? null;
}

// The days from `from` to `to` added up, in the shape of a single day. A
// member, a channel or an emoji counts once however many days they are active.
async function periodStats(
  guildId: string,
  from: Date,
  to: Date
): Promise<DailyStats | null> {
  const guild = await prisma.serverStatsGuild.findUnique({
    where: { guildId },
  });
  if (!guild) {
    return null;
  }

  const where = { guildId, day: { gte: from, lte: to } };
  const [dayTotals, channelRows, memberRows, reactionRows, hourRows] =
    await prisma.$transaction(
      [
        prisma.serverStatsDay.aggregate({
          where,
          _sum: { joins: true, leaves: true, activeNewcomers: true },
        }),
        prisma.serverStatsChannel.groupBy({
          by: ["channelId"],
          where,
          _sum: { messages: true },
          orderBy: { channelId: "asc" },
        }),
        prisma.serverStatsMember.groupBy({
          by: ["userId"],
          where,
          _sum: { messages: true },
          orderBy: { userId: "asc" },
        }),
        prisma.serverStatsReaction.groupBy({
          by: ["emoji"],
          where,
          _sum: { reactions: true },
          orderBy: { emoji: "asc" },
        }),
        prisma.serverStatsHour.groupBy({
          by: ["hour"],
          where,
          _sum: { messages: true },
          orderBy: { hour: "asc" },
        }),
      ],
      { isolationLevel: "RepeatableRead" }
    );
  const channels = ranked(channelRows, (row) => ({
    id: row.channelId,
    count: row._sum.messages ?? 0,
  }));
  const members = ranked(memberRows, (row) => ({
    id: row.userId,
    count: row._sum.messages ?? 0,
  }));
  const reactions = ranked(reactionRows, (row) => ({
    id: row.emoji,
    count: row._sum.reactions ?? 0,
  }));
  const hours = Array.from({ length: 24 }, () => 0);
  for (const row of hourRows) {
    hours[row.hour] = row._sum.messages ?? 0;
  }
  const total = (entries: Ranked[]) =>
    entries.reduce((sum, entry) => sum + entry.count, 0);

  return {
    startedAt: guild.startedAt,
    joins: dayTotals._sum.joins ?? 0,
    activeNewcomers: dayTotals._sum.activeNewcomers ?? 0,
    hours,
    leaves: dayTotals._sum.leaves ?? 0,
    messages: total(channels),
    activeChannels: channels.length,
    activeMembers: members.length,
    reactions: total(reactions),
    topChannels: channels.slice(0, TOP_SIZE),
    topMembers: members.slice(0, TOP_SIZE),
    topReactions: reactions.slice(0, TOP_SIZE),
  };
}

async function purgeBefore(day: Date): Promise<void> {
  const where = { day: { lt: day } };
  await prisma.$transaction([
    prisma.serverStatsDay.deleteMany({ where }),
    prisma.serverStatsChannel.deleteMany({ where }),
    prisma.serverStatsMember.deleteMany({ where }),
    prisma.serverStatsReaction.deleteMany({ where }),
    prisma.serverStatsHour.deleteMany({ where }),
  ]);
}

async function deleteMember(guildId: string, userId: string): Promise<void> {
  await prisma.serverStatsMember.deleteMany({ where: { guildId, userId } });
}

export default {
  recordMessage,
  recordReaction,
  recordMemberChange,
  startedAt,
  dailyStats,
  periodStats,
  history,
  purgeBefore,
  deleteMember,
};
