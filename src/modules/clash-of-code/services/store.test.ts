import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClashReport } from "./api.js";

interface Row extends Record<string, any> {}

const db = vi.hoisted(() => {
  const state = {
    games: [] as Row[],
    players: [] as Row[],
    participations: [] as Row[],
  };

  const flatten = (where: Row = {}) =>
    Object.fromEntries(
      Object.entries(where).flatMap(([key, cond]) =>
        key.includes("_") ? Object.entries(cond as Row) : [[key, cond]]
      )
    );

  const matches = (row: Row, where: Row = {}) =>
    Object.entries(flatten(where)).every(([key, cond]) => {
      const value = row[key];
      if (cond === null || cond instanceof Date || typeof cond !== "object")
        return value === cond;
      if ("in" in cond) return cond.in.includes(value);
      if ("not" in cond) return value !== cond.not;
      if ("equals" in cond)
        return `${value}`.toLowerCase() === `${cond.equals}`.toLowerCase();
      return false;
    });

  const collection = (name: keyof typeof state, keys: string[]) => {
    const find = (where?: Row) =>
      state[name].filter((row) => matches(row, where));
    const keyOf = (row: Row) => keys.map((key) => row[key]).join(":");
    return {
      findMany: async ({ where }: Row = {}) => find(where),
      findFirst: async ({ where }: Row) => find(where)[0] ?? null,
      findUnique: async ({ where }: Row) => find(where)[0] ?? null,
      upsert: async ({ where, create, update }: Row) => {
        const existing = find(where)[0];
        if (existing) Object.assign(existing, update);
        else state[name].push({ ...create });
      },
      update: async ({ where, data }: Row) => {
        const existing = find(where)[0];
        if (!existing) throw new Error("Record not found");
        Object.assign(existing, data);
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = find(where);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      createMany: async ({ data }: Row) => {
        const known = new Set(state[name].map(keyOf));
        for (const row of data as Row[]) {
          if (!known.has(keyOf(row))) state[name].push({ ...row });
        }
      },
    };
  };

  const prisma = {
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    cocGame: collection("games", ["guildId", "handle"]),
    cocPlayer: collection("players", ["guildId", "codingamerId"]),
    cocParticipation: collection("participations", [
      "guildId",
      "handle",
      "codingamerId",
    ]),
  };
  return { state, prisma };
});

vi.mock("#lib/database.js", () => ({ default: db.prisma }));

import store, { GameStatus } from "./store.js";

const GUILD = "guild-1";
const OTHER_GUILD = "guild-2";

function report(handle = "a".repeat(40)): ClashReport {
  return {
    handle,
    mode: "FASTEST",
    startedAt: new Date(0),
    started: true,
    finished: true,
    players: [
      {
        codingamerId: 1,
        nickname: "Ada",
        avatarId: 10n,
        rank: 1,
        score: 100,
        durationMs: 60_000,
        criterion: null,
        language: "Rust",
      },
      {
        codingamerId: 2,
        nickname: "Linus",
        avatarId: null,
        rank: 2,
        score: 50,
        durationMs: 90_000,
        criterion: null,
        language: "C",
      },
    ],
  };
}

const origin = { channelId: "chan-1", messageId: "msg-1" };

function watched(handle = "a".repeat(40), guildId = GUILD) {
  return {
    guildId,
    handle,
    channelId: "chan-1",
    messageId: "msg-1",
    watchUntil: new Date(1_000),
  };
}

beforeEach(() => {
  db.state.games = [];
  db.state.players = [];
  db.state.participations = [];
});

describe("watch", () => {
  it("records a new game as watched", async () => {
    await expect(store.watch(watched())).resolves.toBe("watching");
    expect(db.state.games).toEqual([
      expect.objectContaining({
        status: GameStatus.Watching,
        messageId: "msg-1",
      }),
    ]);
  });

  it("does not watch a game twice, nor one already imported", async () => {
    await store.watch(watched());
    await expect(store.watch(watched())).resolves.toBe("known");
    await store.importReport(GUILD, report("b".repeat(40)), origin);
    await expect(store.watch(watched("b".repeat(40)))).resolves.toBe("known");
  });

  it("watches an abandoned game again", async () => {
    await store.watch(watched());
    await store.abandon(GUILD, "a".repeat(40));
    await expect(
      store.watch({ ...watched(), messageId: "msg-2" })
    ).resolves.toBe("watching");
    expect(db.state.games[0]).toMatchObject({
      status: GameStatus.Watching,
      messageId: "msg-2",
    });
  });

  it("keeps guilds apart", async () => {
    await store.watch(watched());
    await expect(store.watch(watched(undefined, OTHER_GUILD))).resolves.toBe(
      "watching"
    );
    expect(await store.watchedGames([OTHER_GUILD])).toHaveLength(1);
  });
});

describe("abandon", () => {
  it("only gives up on a game still watched", async () => {
    await store.watch(watched());
    await expect(store.abandon(GUILD, "a".repeat(40))).resolves.toBe(true);
    await expect(store.abandon(GUILD, "a".repeat(40))).resolves.toBe(false);
    await store.importReport(GUILD, report("b".repeat(40)), origin);
    await expect(store.abandon(GUILD, "b".repeat(40))).resolves.toBe(false);
  });
});

describe("importReport", () => {
  it("stores the game, its players and their results", async () => {
    await expect(store.importReport(GUILD, report(), origin)).resolves.toBe(
      true
    );
    expect(db.state.games[0]).toMatchObject({
      status: GameStatus.Imported,
      mode: "FASTEST",
    });
    expect(db.state.players).toHaveLength(2);
    expect(await store.participations(GUILD)).toHaveLength(2);
  });

  it("imports a game once, even when asked again", async () => {
    await store.importReport(GUILD, report(), origin);
    await expect(store.importReport(GUILD, report(), origin)).resolves.toBe(
      false
    );
    expect(db.state.participations).toHaveLength(2);
  });

  it("settles a game that was being watched", async () => {
    await store.watch(watched());
    await store.importReport(GUILD, report(), origin);
    expect(await store.watchedGames([GUILD])).toEqual([]);
  });

  it("refreshes a player's nickname", async () => {
    await store.importReport(GUILD, report(), origin);
    const renamed = report("b".repeat(40));
    renamed.players[0]!.nickname = "Ada L.";
    await store.importReport(GUILD, renamed, origin);
    expect(await store.playerByNickname(GUILD, "ada l.")).toMatchObject({
      codingamerId: 1,
    });
  });

  it("keeps the same game apart in two guilds", async () => {
    await store.importReport(GUILD, report(), origin);
    await expect(
      store.importReport(OTHER_GUILD, report(), origin)
    ).resolves.toBe(true);
    expect(await store.participations(GUILD)).toHaveLength(2);
    expect(await store.players(OTHER_GUILD)).toHaveLength(2);
  });
});

describe("participations", () => {
  it("filters by mode and skips games not imported", async () => {
    await store.importReport(GUILD, report(), origin);
    const shortest = report("b".repeat(40));
    shortest.mode = "SHORTEST";
    await store.importReport(GUILD, shortest, origin);
    await store.watch(watched("c".repeat(40)));

    expect(await store.participations(GUILD)).toHaveLength(4);
    expect(await store.participations(GUILD, "SHORTEST")).toHaveLength(2);
    expect(await store.participations(GUILD, "REVERSE")).toEqual([]);
  });
});

describe("link", () => {
  beforeEach(async () => {
    await store.importReport(GUILD, report(), origin);
  });

  it("links a member to a player", async () => {
    await expect(store.link(GUILD, "user-1", 1)).resolves.toEqual({
      kind: "linked",
    });
    expect(await store.playerByUser(GUILD, "user-1")).toMatchObject({
      nickname: "Ada",
    });
    await expect(store.link(GUILD, "user-1", 1)).resolves.toEqual({
      kind: "unchanged",
    });
  });

  it("refuses a player linked to someone else", async () => {
    await store.link(GUILD, "user-1", 1);
    await expect(store.link(GUILD, "user-2", 1)).resolves.toEqual({
      kind: "conflict",
      userId: "user-1",
    });
  });

  it("moves a member's link to another player", async () => {
    await store.link(GUILD, "user-1", 1);
    await store.link(GUILD, "user-1", 2);
    expect(db.state.players.filter((p) => p.userId === "user-1")).toEqual([
      expect.objectContaining({ codingamerId: 2 }),
    ]);
  });

  it("reports an unknown player", async () => {
    await expect(store.link(GUILD, "user-1", 99)).resolves.toEqual({
      kind: "unknown",
    });
  });

  it("unlinks a member", async () => {
    await store.link(GUILD, "user-1", 1);
    await expect(store.unlink(GUILD, "user-1")).resolves.toBe("Ada");
    await expect(store.unlink(GUILD, "user-1")).resolves.toBeNull();
    expect(await store.playerByUser(GUILD, "user-1")).toBeNull();
  });
});
