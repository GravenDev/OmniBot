import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const db = vi.hoisted(() => {
  const state = {
    hubs: [] as Row[],
    channels: [] as Row[],
    preferences: [] as Row[],
    hubReads: 0,
  };
  // The subset of Prisma's filters the store uses: equality, `in` and `lt`.
  const matches = (where: Row) => (row: Row) =>
    Object.entries(where).every(([key, condition]) => {
      if (condition && typeof condition === "object" && "in" in condition) {
        return condition.in.includes(row[key]);
      }
      if (condition && typeof condition === "object" && "lt" in condition) {
        return row[key] < condition.lt;
      }
      return row[key] === condition;
    });
  // A compound unique key (`guildId_userId: {...}`) holds the fields to match.
  const unique = (where: Row): Row => {
    const [value] = Object.values(where);
    return Object.keys(where).length === 1 && typeof value === "object"
      ? value
      : where;
  };
  const table = (name: "hubs" | "channels" | "preferences") => ({
    findMany: async ({ where = {}, distinct }: Row = {}) => {
      if (name === "hubs") state.hubReads++;
      const rows = state[name].filter(matches(where));
      if (!distinct) return rows.map((row) => ({ ...row }));
      const seen = new Set<string>();
      return rows.filter((row) => {
        const key = distinct.map((field: string) => row[field]).join();
        return !seen.has(key) && seen.add(key);
      });
    },
    findUnique: async ({ where }: Row) => {
      const row = state[name].find(matches(unique(where)));
      return row ? { ...row } : null;
    },
    findFirst: async ({ where, orderBy }: Row) => {
      const [[field, direction]] = Object.entries(orderBy) as [
        [string, string],
      ];
      const rows = state[name]
        .filter(matches(where))
        .sort((a, b) =>
          direction === "desc" ? b[field] - a[field] : a[field] - b[field]
        );
      return rows[0] ? { ...rows[0] } : null;
    },
    create: async ({ data }: Row) => {
      const row = { panelMessageId: null, createdAt: new Date(), ...data };
      state[name].push(row);
      return { ...row };
    },
    upsert: async ({ where, create, update }: Row) => {
      const existing = state[name].find(matches(unique(where)));
      if (existing) Object.assign(existing, update);
      else state[name].push({ ...create });
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = state[name].filter(matches(where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
    deleteMany: async ({ where }: Row) => {
      const before = state[name].length;
      state[name] = state[name].filter((row) => !matches(where)(row));
      return { count: before - state[name].length };
    },
  });
  const prisma = {
    tempVoiceHub: table("hubs"),
    tempVoiceChannel: table("channels"),
    tempVoicePreference: table("preferences"),
  };
  return { state, prisma };
});

vi.mock("#lib/database.js", () => ({ default: db.prisma }));

let store: (typeof import("./store.service.js"))["default"];

beforeEach(async () => {
  vi.resetModules();
  db.state.hubs = [];
  db.state.channels = [];
  db.state.preferences = [];
  db.state.hubReads = 0;
  ({ default: store } = await import("./store.service.js"));
});

function channel(change: Row = {}) {
  return {
    channelId: "c1",
    guildId: "g1",
    hubId: "h1",
    ownerId: "owner",
    locked: false,
    hidden: false,
    trusted: [],
    blocked: [],
    ...change,
  };
}

describe("hubs", () => {
  it("reads a guild's hubs once, until one is saved or removed", async () => {
    db.state.hubs.push(
      { guildId: "g1", channelId: "h1", nameTemplate: "A", userLimit: 0 },
      { guildId: "g2", channelId: "h2", nameTemplate: "B", userLimit: 2 }
    );

    expect(await store.hubs("g1")).toEqual([
      { channelId: "h1", nameTemplate: "A", userLimit: 0 },
    ]);
    expect(await store.hub("g1", "h1")).toEqual({
      channelId: "h1",
      nameTemplate: "A",
      userLimit: 0,
    });
    expect(await store.hub("g1", "h2")).toBeNull();
    expect(db.state.hubReads).toBe(1);

    await store.saveHub("g1", {
      channelId: "h1",
      nameTemplate: "C",
      userLimit: 5,
    });
    expect(await store.hub("g1", "h1")).toEqual({
      channelId: "h1",
      nameTemplate: "C",
      userLimit: 5,
    });
    expect(db.state.hubReads).toBe(2);

    expect(await store.removeHub("g1", "h1")).toBe(true);
    expect(await store.hubs("g1")).toEqual([]);
    expect(await store.removeHub("g1", "h1")).toBe(false);
    expect(db.state.hubs).toHaveLength(1);
  });

  it("hands out copies the caller cannot alter the cache through", async () => {
    db.state.hubs.push({
      guildId: "g1",
      channelId: "h1",
      nameTemplate: "A",
      userLimit: 0,
    });
    (await store.hub("g1", "h1"))!.nameTemplate = "changed";
    (await store.hubs("g1"))[0]!.userLimit = 9;
    expect(await store.hub("g1", "h1")).toEqual({
      channelId: "h1",
      nameTemplate: "A",
      userLimit: 0,
    });
  });
});

describe("temporary channels", () => {
  it("creates, finds and updates a channel", async () => {
    await store.createChannel(channel());
    expect(await store.channel("c1")).toMatchObject({
      ownerId: "owner",
      panelMessageId: null,
    });

    expect(
      await store.updateChannel("c1", { locked: true, trusted: ["u1"] })
    ).toMatchObject({
      locked: true,
      trusted: ["u1"],
    });
    expect(await store.updateChannel("gone", { locked: true })).toBeNull();
  });

  it("finds an owner's most recent channel in the guild", async () => {
    db.state.channels.push(
      { ...channel({ channelId: "old" }), createdAt: new Date(1) },
      { ...channel({ channelId: "new" }), createdAt: new Date(2) },
      {
        ...channel({ channelId: "other", guildId: "g2" }),
        createdAt: new Date(3),
      }
    );
    expect((await store.ownedBy("g1", "owner"))?.channelId).toBe("new");
    expect(await store.ownedBy("g1", "nobody")).toBeNull();
  });

  it("lists the guilds with channels, and removes channels by guild or one by one", async () => {
    await store.createChannel(channel({ channelId: "a" }));
    await store.createChannel(channel({ channelId: "b" }));
    await store.createChannel(channel({ channelId: "c", guildId: "g2" }));
    await store.createChannel(channel({ channelId: "d", guildId: "g3" }));

    expect((await store.guildIds()).sort()).toEqual(["g1", "g2", "g3"]);
    expect((await store.channels("g1")).map((row) => row.channelId)).toEqual([
      "a",
      "b",
    ]);

    expect(await store.removeGuildChannels(["g1", "g2"])).toBe(3);
    expect(await store.guildIds()).toEqual(["g3"]);
    expect(await store.removeChannel("d")).toBe(true);
    expect(await store.removeChannel("d")).toBe(false);
  });
});

describe("preferences", () => {
  it("saves a member's preference per guild and reads back only its settings", async () => {
    expect(await store.preference("g1", "u1")).toBeNull();

    await store.savePreference("g1", "u1", {
      name: "Mine",
      userLimit: null,
      locked: true,
      hidden: false,
      trusted: [],
      blocked: [],
    });
    await store.savePreference("g1", "u1", { userLimit: 3 });

    expect(await store.preference("g1", "u1")).toEqual({
      name: "Mine",
      userLimit: 3,
      locked: true,
      hidden: false,
      trusted: [],
      blocked: [],
    });
    expect(await store.preference("g2", "u1")).toBeNull();
  });

  it("purges preferences not used since a date, unless touched since", async () => {
    const old = new Date("2025-01-01");
    db.state.preferences.push(
      { guildId: "g1", userId: "idle", updatedAt: old },
      { guildId: "g1", userId: "active", updatedAt: old }
    );
    await store.touchPreference("g1", "active");

    expect(await store.purgePreferencesBefore(new Date("2026-01-01"))).toBe(1);
    expect(db.state.preferences.map((row) => row.userId)).toEqual(["active"]);
  });
});
