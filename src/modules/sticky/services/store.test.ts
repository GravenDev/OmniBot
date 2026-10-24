import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  guildId: string;
  channelId: string;
  content: string;
  messageId: string | null;
}

const db = vi.hoisted(() => {
  const state = { rows: [] as Row[], reads: 0, failReads: 0 };
  const matches =
    (where: { guildId: string; channelId: string | { in: string[] } }) =>
    (row: Row) =>
      row.guildId === where.guildId &&
      (typeof where.channelId === "string"
        ? row.channelId === where.channelId
        : where.channelId.in.includes(row.channelId));
  const prisma = {
    stickyMessage: {
      findMany: async ({ where }: { where: { guildId: string } }) => {
        state.reads++;
        if (state.failReads > 0) {
          state.failReads--;
          throw new Error("database");
        }
        return state.rows.filter((row) => row.guildId === where.guildId);
      },
      upsert: async ({
        create,
        update,
      }: {
        create: Omit<Row, "messageId">;
        update: { content: string };
      }) => {
        const existing = state.rows.find(
          (row) =>
            row.guildId === create.guildId && row.channelId === create.channelId
        );
        if (existing) Object.assign(existing, update);
        else state.rows.push({ ...create, messageId: null });
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { guildId: string; channelId: string };
        data: { messageId: string };
      }) => {
        const rows = state.rows.filter(matches(where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      deleteMany: async ({
        where,
      }: {
        where: { guildId: string; channelId: { in: string[] } };
      }) => {
        const before = state.rows.length;
        state.rows = state.rows.filter((row) => !matches(where)(row));
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
  db.state.failReads = 0;
  guildId = `g${++guild}`;
});

describe("StickyStore", () => {
  it("returns null for a channel without sticky", async () => {
    expect(await store.get(guildId, "c1")).toBeNull();
  });

  it("keeps the posted message when the content changes", async () => {
    await store.set(guildId, "c1", "hello");
    await store.setMessageId(guildId, "c1", "m1");
    await store.set(guildId, "c1", "bye");
    expect(await store.get(guildId, "c1")).toEqual({
      channelId: "c1",
      content: "bye",
      messageId: "m1",
    });
  });

  it("serves repeated lookups from the cache", async () => {
    await store.set(guildId, "c1", "hello");
    await store.get(guildId, "c1");
    await store.get(guildId, "c1");
    expect(db.state.reads).toBe(1);
  });

  it("records the posted message without reloading", async () => {
    await store.set(guildId, "c1", "hello");
    expect((await store.get(guildId, "c1"))?.messageId).toBeNull();
    await store.setMessageId(guildId, "c1", "m2");
    expect((await store.get(guildId, "c1"))?.messageId).toBe("m2");
    expect(db.state.reads).toBe(1);
  });

  it("records the message even when the cache cannot be reloaded", async () => {
    await store.set(guildId, "c1", "hello");
    db.state.failReads = 1;
    await expect(store.setMessageId(guildId, "c1", "m1")).resolves.toBe(
      undefined
    );
    expect((await store.get(guildId, "c1"))?.messageId).toBe("m1");
  });

  it("hands out copies the caller cannot alter", async () => {
    await store.set(guildId, "c1", "hello");
    const sticky = await store.get(guildId, "c1");
    await store.setMessageId(guildId, "c1", "m2");
    expect(sticky?.messageId).toBeNull();
  });

  it("reloads after the content changes", async () => {
    await store.set(guildId, "c1", "hello");
    await store.get(guildId, "c1");
    await store.set(guildId, "c1", "bye");
    expect((await store.get(guildId, "c1"))?.content).toBe("bye");
  });

  it("does not recreate a removed sticky when recording its message", async () => {
    await store.setMessageId(guildId, "c1", "m1");
    expect(await store.get(guildId, "c1")).toBeNull();
  });

  it("removes several channels and counts them", async () => {
    await store.set(guildId, "c1", "a");
    await store.set(guildId, "c2", "b");
    await store.set(guildId, "c3", "c");
    expect(await store.remove(guildId, "c1", "c2", "c9")).toBe(2);
    expect((await store.list(guildId)).map((s) => s.channelId)).toEqual(["c3"]);
  });

  it("keeps guilds apart", async () => {
    await store.set(guildId, "c1", "hello");
    expect(await store.get("other", "c1")).toBeNull();
  });
});
