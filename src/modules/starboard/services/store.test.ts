import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  starboardEntry: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("#lib/database.js", () => ({
  default: prisma,
  Prisma: { DbNull: "DbNull" },
}));

const { default: store } = await import("./store.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StarboardStore", () => {
  it("dismisses an entry only while it still points to the deleted repost", async () => {
    await store.dismiss("m1", "sb1");

    expect(prisma.starboardEntry.updateMany).toHaveBeenCalledWith({
      where: { messageId: "m1", starboardMessageId: "sb1" },
      data: { starboardMessageId: null },
    });
  });

  it("finds the entries of originals and reposts in one query", async () => {
    prisma.starboardEntry.findMany.mockResolvedValue([]);

    await store.findInvolving(["a", "b"]);

    expect(prisma.starboardEntry.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { messageId: { in: ["a", "b"] } },
          { starboardMessageId: { in: ["a", "b"] } },
        ],
      },
    });
  });

  it("forgets the entries of a deleted channel, as source or starboard", async () => {
    await store.removeForChannel("g1", "c1");

    expect(prisma.starboardEntry.deleteMany).toHaveBeenCalledWith({
      where: {
        guildId: "g1",
        OR: [
          { channelId: "c1" },
          { parentChannelId: "c1" },
          { starboardChannelId: "c1" },
        ],
      },
    });
  });

  it("lists the entries of a channel and of its threads", async () => {
    prisma.starboardEntry.findMany.mockResolvedValue([]);

    await store.listForChannel("g1", "forum");

    expect(prisma.starboardEntry.findMany).toHaveBeenCalledWith({
      where: {
        guildId: "g1",
        OR: [{ channelId: "forum" }, { parentChannelId: "forum" }],
      },
    });
  });
});
