import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  guildId: string;
  channelId: string;
  emoji: string;
}

const db = vi.hoisted(() => {
  const state = { rows: [] as Row[], reads: 0 };
  const prisma = {
    autoReaction: {
      findMany: async ({ where }: { where: { guildId: string } }) => {
        state.reads++;
        return state.rows.filter((row) => row.guildId === where.guildId);
      },
      upsert: async ({
        create,
        update,
      }: {
        create: Row;
        update: { emoji: string };
      }) => {
        const existing = state.rows.find(
          (row) =>
            row.guildId === create.guildId && row.channelId === create.channelId
        );
        if (existing) Object.assign(existing, update);
        else state.rows.push({ ...create });
      },
      deleteMany: async ({
        where,
      }: {
        where: { guildId: string; channelId: { in: string[] } };
      }) => {
        const before = state.rows.length;
        state.rows = state.rows.filter(
          (row) =>
            row.guildId !== where.guildId ||
            !where.channelId.in.includes(row.channelId)
        );
        return { count: before - state.rows.length };
      },
    },
  };
  return { state, prisma };
});

vi.mock("#lib/database.js", () => ({ default: db.prisma }));

const { default: store } = await import("./store.js");

let guild = 0;
let guildId: string;

beforeEach(() => {
  db.state.rows = [];
  db.state.reads = 0;
  guildId = `g${++guild}`;
});

describe("AutoReactStore", () => {
  it("returns null for a channel without reaction", async () => {
    expect(await store.emojiFor(guildId, "c1")).toBeNull();
  });

  it("returns the emoji set for a channel", async () => {
    await store.set(guildId, "c1", "👍");
    expect(await store.emojiFor(guildId, "c1")).toBe("👍");
    expect(await store.emojiFor(guildId, "c2")).toBeNull();
  });

  it("keeps one reaction per channel", async () => {
    await store.set(guildId, "c1", "👍");
    await store.set(guildId, "c1", "🎉");
    expect(await store.list(guildId)).toEqual([
      { channelId: "c1", emoji: "🎉" },
    ]);
  });

  it("serves repeated lookups from the cache", async () => {
    await store.set(guildId, "c1", "👍");
    await store.emojiFor(guildId, "c1");
    await store.emojiFor(guildId, "c1");
    expect(db.state.reads).toBe(1);
  });

  it("reloads after a change", async () => {
    await store.set(guildId, "c1", "👍");
    expect(await store.emojiFor(guildId, "c1")).toBe("👍");
    await store.remove(guildId, "c1");
    expect(await store.emojiFor(guildId, "c1")).toBeNull();
  });

  it("removes several channels and counts them", async () => {
    await store.set(guildId, "c1", "👍");
    await store.set(guildId, "c2", "🎉");
    await store.set(guildId, "c3", "🔥");
    expect(await store.remove(guildId, "c1", "c2", "c9")).toBe(2);
    expect(await store.list(guildId)).toEqual([
      { channelId: "c3", emoji: "🔥" },
    ]);
  });

  it("keeps guilds apart", async () => {
    await store.set(guildId, "c1", "👍");
    expect(await store.emojiFor("other", "c1")).toBeNull();
  });
});
