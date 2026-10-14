import prisma from "#lib/database.js";

export const TOP_SIZE = 5;

export interface Ranked {
  id: string;
  count: number;
}

export interface DailyStats {
  startedAt: Date;
  joins: number;
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
  channelId: string,
  userId: string
): Promise<void> {
  await ensureStarted(guildId);
  await prisma.$transaction([
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
  ] = await Promise.all([
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
  ]);

  return {
    startedAt: guild.startedAt,
    joins: dayRow?.joins ?? 0,
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

async function purgeBefore(day: Date): Promise<void> {
  const where = { day: { lt: day } };
  await prisma.$transaction([
    prisma.serverStatsDay.deleteMany({ where }),
    prisma.serverStatsChannel.deleteMany({ where }),
    prisma.serverStatsMember.deleteMany({ where }),
    prisma.serverStatsReaction.deleteMany({ where }),
  ]);
}

export default {
  recordMessage,
  recordReaction,
  recordMemberChange,
  dailyStats,
  purgeBefore,
};
