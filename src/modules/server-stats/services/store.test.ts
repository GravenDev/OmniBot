import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => {
  const model = () => ({
    upsert: vi.fn((args: unknown) => ({ op: "upsert", args })),
    createMany: vi.fn(async () => ({ count: 1 })),
    findUnique: vi.fn(async (): Promise<unknown> => null),
    findMany: vi.fn(async (): Promise<unknown[]> => []),
    aggregate: vi.fn(async (): Promise<unknown> => ({})),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async (): Promise<unknown[]> => []),
    deleteMany: vi.fn((args: unknown) => ({ op: "deleteMany", args })),
  });
  return {
    serverStatsGuild: model(),
    serverStatsDay: model(),
    serverStatsChannel: model(),
    serverStatsMember: model(),
    serverStatsReaction: model(),
    serverStatsHour: model(),
    $transaction: vi.fn(
      async (operations: unknown[], _options?: unknown): Promise<unknown[]> =>
        Promise.all(operations)
    ),
  };
});
vi.mock("#lib/database.js", () => ({ default: prisma }));

const { default: store } = await import("./store.js");

const day = new Date("2026-10-13T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recording", () => {
  it("increments the hour, channel and member counters of the day", async () => {
    await store.recordMessage("guild-1", day, 21, "chan-1", "user-1", true);
    expect(prisma.serverStatsHour.upsert).toHaveBeenCalledWith({
      where: { guildId_day_hour: { guildId: "guild-1", day, hour: 21 } },
      create: { guildId: "guild-1", day, hour: 21, messages: 1 },
      update: { messages: { increment: 1 } },
    });
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
    expect(prisma.serverStatsDay.upsert).not.toHaveBeenCalled();
  });

  it("counts a newcomer on their first message of the day only", async () => {
    prisma.$transaction.mockResolvedValueOnce([{}, {}, { messages: 1 }]);
    await store.recordMessage("guild-1", day, 9, "chan-1", "user-1", true);
    expect(prisma.serverStatsDay.upsert).toHaveBeenCalledWith({
      where: { guildId_day: { guildId: "guild-1", day } },
      create: { guildId: "guild-1", day, activeNewcomers: 1 },
      update: { activeNewcomers: { increment: 1 } },
    });
  });

  it("does not count a member who joined another day", async () => {
    prisma.$transaction.mockResolvedValueOnce([{}, {}, { messages: 1 }]);
    await store.recordMessage("guild-1", day, 9, "chan-1", "user-1", false);
    expect(prisma.serverStatsDay.upsert).not.toHaveBeenCalled();
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
      activeNewcomers: 1,
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
    prisma.serverStatsHour.findMany.mockResolvedValueOnce([
      { hour: 0, messages: 2 },
      { hour: 21, messages: 40 },
    ]);
    const hours = Array.from({ length: 24 }, () => 0);
    hours[0] = 2;
    hours[21] = 40;

    expect(await store.dailyStats("guild-1", day)).toEqual({
      startedAt,
      joins: 3,
      activeNewcomers: 1,
      hours,
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
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: "RepeatableRead",
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
      activeNewcomers: 0,
      hours: Array.from({ length: 24 }, () => 0),
      leaves: 0,
      messages: 0,
      reactions: 0,
      topChannels: [],
    });
  });
});

describe("startedAt", () => {
  it("gives when counting started, or null before", async () => {
    const startedAt = new Date("2026-10-01T10:00:00Z");
    prisma.serverStatsGuild.findUnique.mockResolvedValueOnce({ startedAt });
    expect(await store.startedAt("guild-1")).toEqual(startedAt);
    expect(await store.startedAt("guild-1")).toBeNull();
  });
});

describe("periodStats", () => {
  const from = new Date("2026-10-07T00:00:00Z");

  it("returns null before counting started", async () => {
    expect(await store.periodStats("guild-1", from, day)).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("adds the days up, counting each member, channel and emoji once", async () => {
    const startedAt = new Date("2026-10-01T10:00:00Z");
    prisma.serverStatsGuild.findUnique.mockResolvedValueOnce({ startedAt });
    prisma.serverStatsDay.aggregate.mockResolvedValueOnce({
      _sum: { joins: 9, leaves: 4, activeNewcomers: 3 },
    });
    prisma.serverStatsChannel.groupBy.mockResolvedValueOnce([
      { channelId: "c1", _sum: { messages: 30 } },
      { channelId: "c2", _sum: { messages: 120 } },
      { channelId: "c3", _sum: { messages: 30 } },
    ]);
    prisma.serverStatsMember.groupBy.mockResolvedValueOnce(
      Array.from({ length: 7 }, (_, index) => ({
        userId: `u${index}`,
        _sum: { messages: index * 10 },
      }))
    );
    prisma.serverStatsReaction.groupBy.mockResolvedValueOnce([
      { emoji: "👍", _sum: { reactions: 5 } },
      { emoji: "🔥", _sum: { reactions: 8 } },
    ]);
    prisma.serverStatsHour.groupBy.mockResolvedValueOnce([
      { hour: 0, _sum: { messages: 60 } },
      { hour: 21, _sum: { messages: 120 } },
    ]);
    const hours = Array.from({ length: 24 }, () => 0);
    hours[0] = 60;
    hours[21] = 120;

    expect(await store.periodStats("guild-1", from, day)).toEqual({
      startedAt,
      joins: 9,
      activeNewcomers: 3,
      hours,
      leaves: 4,
      messages: 180,
      activeChannels: 3,
      activeMembers: 7,
      reactions: 13,
      topChannels: [
        { id: "c2", count: 120 },
        { id: "c1", count: 30 },
        { id: "c3", count: 30 },
      ],
      topMembers: [
        { id: "u6", count: 60 },
        { id: "u5", count: 50 },
        { id: "u4", count: 40 },
        { id: "u3", count: 30 },
        { id: "u2", count: 20 },
      ],
      topReactions: [
        { id: "🔥", count: 8 },
        { id: "👍", count: 5 },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: "RepeatableRead",
    });
    expect(prisma.serverStatsMember.groupBy).toHaveBeenCalledWith({
      by: ["userId"],
      where: { guildId: "guild-1", day: { gte: from, lte: day } },
      _sum: { messages: true },
      orderBy: { userId: "asc" },
    });
  });

  it("reports zeros for quiet days", async () => {
    prisma.serverStatsGuild.findUnique.mockResolvedValueOnce({
      startedAt: from,
    });
    prisma.serverStatsDay.aggregate.mockResolvedValueOnce({
      _sum: { joins: null, leaves: null, activeNewcomers: null },
    });
    expect(await store.periodStats("guild-1", from, day)).toMatchObject({
      joins: 0,
      activeNewcomers: 0,
      hours: Array.from({ length: 24 }, () => 0),
      leaves: 0,
      messages: 0,
      activeMembers: 0,
      reactions: 0,
      topChannels: [],
    });
  });
});

describe("history", () => {
  it("totals each day of the range that has data, and leaves out the others", async () => {
    const before = new Date("2026-10-12T00:00:00Z");
    prisma.serverStatsDay.findMany.mockResolvedValueOnce([
      { day: before, joins: 4, leaves: 1 },
    ]);
    prisma.serverStatsChannel.groupBy.mockResolvedValueOnce([
      { day, _sum: { messages: 120 } },
    ]);
    prisma.serverStatsMember.groupBy.mockResolvedValueOnce([
      { day, _count: 12 },
    ]);
    prisma.serverStatsReaction.groupBy.mockResolvedValueOnce([
      { day: before, _sum: { reactions: 9 } },
    ]);

    const history = await store.history("guild-1", before, day);

    expect(history.get(before.getTime())).toEqual({
      joins: 4,
      messages: 0,
      activeMembers: 0,
      reactions: 9,
    });
    expect(history.has(new Date("2026-10-11T00:00:00Z").getTime())).toBe(false);
    expect(history.get(day.getTime())).toEqual({
      joins: 0,
      messages: 120,
      activeMembers: 12,
      reactions: 0,
    });
    expect(prisma.serverStatsChannel.groupBy).toHaveBeenCalledWith({
      by: ["day"],
      where: { guildId: "guild-1", day: { gte: before, lte: day } },
      _sum: { messages: true },
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
      prisma.serverStatsHour,
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
