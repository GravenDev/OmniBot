import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => {
  const model = () => ({
    upsert: vi.fn((args: unknown) => ({ op: "upsert", args })),
    createMany: vi.fn(async () => ({ count: 1 })),
    findUnique: vi.fn(async (): Promise<unknown> => null),
    findMany: vi.fn(async (): Promise<unknown[]> => []),
    aggregate: vi.fn(async (): Promise<unknown> => ({})),
    count: vi.fn(async () => 0),
    deleteMany: vi.fn((args: unknown) => ({ op: "deleteMany", args })),
  });
  return {
    serverStatsGuild: model(),
    serverStatsDay: model(),
    serverStatsChannel: model(),
    serverStatsMember: model(),
    serverStatsReaction: model(),
    $transaction: vi.fn(async (operations: unknown[]) => operations),
  };
});
vi.mock("#lib/database.js", () => ({ default: prisma }));

const { default: store } = await import("./store.js");

const day = new Date("2026-10-13T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recording", () => {
  it("increments the channel and member counters of the day", async () => {
    await store.recordMessage("guild-1", day, "chan-1", "user-1");
    expect(prisma.serverStatsChannel.upsert).toHaveBeenCalledWith({
      where: {
        guildId_day_channelId: { guildId: "guild-1", day, channelId: "chan-1" },
      },
      create: { guildId: "guild-1", day, channelId: "chan-1", messages: 1 },
      update: { messages: { increment: 1 } },
    });
    expect(prisma.serverStatsMember.upsert).toHaveBeenCalledWith({
      where: {
        guildId_day_userId: { guildId: "guild-1", day, userId: "user-1" },
      },
      create: { guildId: "guild-1", day, userId: "user-1", messages: 1 },
      update: { messages: { increment: 1 } },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("records the start of counting once per guild", async () => {
    await store.recordReaction("guild-2", day, "👍");
    await store.recordReaction("guild-2", day, "👍");
    expect(prisma.serverStatsGuild.createMany).toHaveBeenCalledOnce();
    expect(prisma.serverStatsGuild.createMany).toHaveBeenCalledWith({
      data: [{ guildId: "guild-2" }],
      skipDuplicates: true,
    });
  });

  it("increments only the requested member change", async () => {
    await store.recordMemberChange("guild-1", day, "leaves");
    expect(prisma.serverStatsDay.upsert).toHaveBeenCalledWith({
      where: { guildId_day: { guildId: "guild-1", day } },
      create: { guildId: "guild-1", day, leaves: 1 },
      update: { leaves: { increment: 1 } },
    });
  });
});

describe("dailyStats", () => {
  it("returns null before counting started", async () => {
    expect(await store.dailyStats("guild-1", day)).toBeNull();
  });

  it("assembles the totals and rankings of the day", async () => {
    const startedAt = new Date("2026-10-01T10:00:00Z");
    prisma.serverStatsGuild.findUnique.mockResolvedValueOnce({ startedAt });
    prisma.serverStatsDay.findUnique.mockResolvedValueOnce({
      joins: 3,
      leaves: 1,
    });
    prisma.serverStatsChannel.aggregate.mockResolvedValueOnce({
      _sum: { messages: 42 },
      _count: 2,
    });
    prisma.serverStatsChannel.findMany.mockResolvedValueOnce([
      { channelId: "c1", messages: 30 },
      { channelId: "c2", messages: 12 },
    ]);
    prisma.serverStatsMember.count.mockResolvedValueOnce(7);
    prisma.serverStatsMember.findMany.mockResolvedValueOnce([
      { userId: "u1", messages: 20 },
    ]);
    prisma.serverStatsReaction.aggregate.mockResolvedValueOnce({
      _sum: { reactions: 5 },
    });
    prisma.serverStatsReaction.findMany.mockResolvedValueOnce([
      { emoji: "👍", reactions: 5 },
    ]);

    expect(await store.dailyStats("guild-1", day)).toEqual({
      startedAt,
      joins: 3,
      leaves: 1,
      messages: 42,
      activeChannels: 2,
      activeMembers: 7,
      reactions: 5,
      topChannels: [
        { id: "c1", count: 30 },
        { id: "c2", count: 12 },
      ],
      topMembers: [{ id: "u1", count: 20 }],
      topReactions: [{ id: "👍", count: 5 }],
    });
    expect(prisma.serverStatsMember.findMany).toHaveBeenCalledWith({
      where: { guildId: "guild-1", day },
      orderBy: [{ messages: "desc" }, { userId: "asc" }],
      take: 5,
    });
  });

  it("reports zeros for a quiet day", async () => {
    prisma.serverStatsGuild.findUnique.mockResolvedValueOnce({
      startedAt: day,
    });
    prisma.serverStatsChannel.aggregate.mockResolvedValueOnce({
      _sum: { messages: null },
      _count: 0,
    });
    prisma.serverStatsReaction.aggregate.mockResolvedValueOnce({
      _sum: { reactions: null },
    });
    expect(await store.dailyStats("guild-1", day)).toMatchObject({
      joins: 0,
      leaves: 0,
      messages: 0,
      reactions: 0,
      topChannels: [],
    });
  });
});

describe("purgeBefore", () => {
  it("deletes the counters older than the given day in every table", async () => {
    await store.purgeBefore(day);
    for (const model of [
      prisma.serverStatsDay,
      prisma.serverStatsChannel,
      prisma.serverStatsMember,
      prisma.serverStatsReaction,
    ]) {
      expect(model.deleteMany).toHaveBeenCalledWith({
        where: { day: { lt: day } },
      });
    }
    expect(prisma.serverStatsGuild.deleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteMember", () => {
  it("deletes the member's counters on that guild only", async () => {
    await store.deleteMember("guild-1", "user-1");

    expect(prisma.serverStatsMember.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "guild-1", userId: "user-1" },
    });
    for (const model of [
      prisma.serverStatsDay,
      prisma.serverStatsChannel,
      prisma.serverStatsReaction,
      prisma.serverStatsGuild,
    ]) {
      expect(model.deleteMany).not.toHaveBeenCalled();
    }
  });
});
