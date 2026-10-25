import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "./store.js";

interface Row extends Record<string, any> {}

const db = vi.hoisted(() => {
  const state = {
    accounts: [] as Row[],
    rolls: [] as Row[],
    reminders: [] as Row[],
    claims: [] as Row[],
    table: null as Row | null,
  };

  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, cond]) => {
      if (key.includes("_"))
        return key.split("_").every((k) => row[k] === cond[k]);
      if (cond instanceof Date || typeof cond !== "object")
        return row[key] === cond;
      const value = row[key];
      if ("in" in cond) return cond.in.includes(value);
      if ("equals" in cond)
        return `${value}`.toLowerCase() === cond.equals.toLowerCase();
      return (
        (cond.gte === undefined || value >= cond.gte) &&
        (cond.lt === undefined || value < cond.lt)
      );
    });

  const sorted = (rows: Row[], orderBy: Row | Row[] = []) =>
    rows.sort((a, b) => {
      for (const order of [orderBy].flat()) {
        const [key, dir] = Object.entries(order)[0] as [string, string];
        const diff = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
        if (diff) return dir === "desc" ? -diff : diff;
      }
      return 0;
    });

  const collection = (name: "accounts" | "rolls" | "reminders" | "claims") => {
    const find = ({ where, orderBy }: Row) =>
      sorted(
        state[name].filter((row) => matches(row, where)),
        orderBy
      );
    return {
      findMany: async (args: Row) => find(args),
      findFirst: async (args: Row) => find(args)[0] ?? null,
      findUnique: async (args: Row) => find(args)[0] ?? null,
      deleteMany: async ({ where }: Row) => {
        const removed = find({ where });
        state[name] = state[name].filter((row) => !removed.includes(row));
        return { count: removed.length };
      },
    };
  };

  const prisma = {
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    rngdleAccount: {
      ...collection("accounts"),
      upsert: async ({ where, create, update }: Row) => {
        const existing = state.accounts.find((row) => matches(row, where));
        if (existing) Object.assign(existing, update);
        else state.accounts.push({ ...create });
      },
    },
    rngdleRoll: {
      ...collection("rolls"),
      createMany: async ({ data }: Row) => {
        state.rolls.push(...data);
        return { count: data.length };
      },
      update: async ({ where, data }: Row) => {
        Object.assign(
          state.rolls.find((row) => matches(row, where))!,
          data
        );
      },
      groupBy: async ({ where }: Row) => {
        const sums = new Map<string, bigint>();
        for (const row of state.rolls.filter((r) => matches(r, where))) {
          sums.set(
            row["userId"],
            (sums.get(row["userId"]) ?? 0n) + row["score"]
          );
        }
        return [...sums].map(([userId, sum]) => ({
          userId,
          _sum: { score: sum },
        }));
      },
    },
    rngdleReminder: {
      ...collection("reminders"),
      upsert: async ({ where, create }: Row) => {
        if (!state.reminders.some((row) => matches(row, where)))
          state.reminders.push({ ...create });
      },
    },
    rngdleCardClaim: {
      ...collection("claims"),
      createMany: async ({ data }: Row) => {
        state.claims.push(...data);
        return { count: data.length };
      },
    },
    rngdleScoreTable: {
      findUnique: async () => state.table,
      upsert: async ({ create }: Row) => void (state.table = { ...create }),
    },
  };

  return { state, prisma };
});

vi.mock("#lib/database.js", () => ({ default: db.prisma }));

const account = (guildId: string, userId: string): Account => ({
  guildId,
  userId,
  username: userId,
});
const alice = account("g1", "alice");
const bob = account("g1", "bob");
const zoe = account("g2", "zoe");

const remote = (id: string, score: number, badgeCount = 0, day = 1) => ({
  id,
  number: day,
  score,
  badgeCount,
  rolledAt: new Date(Date.UTC(2026, 0, day)),
});

let store: (typeof import("./store.js"))["default"];

async function seed(who: Account, ...rolls: ReturnType<typeof remote>[]) {
  await store.register(who.guildId, who.userId, who.username);
  await store.saveRolls(who, rolls);
}

const scores = async (guildId = "g1", filter = {}) =>
  (await store.rolls(guildId, filter)).map((roll) => roll.score);

beforeEach(async () => {
  db.state.accounts = [];
  db.state.rolls = [];
  db.state.reminders = [];
  db.state.claims = [];
  db.state.table = null;
  vi.resetModules();
  store = (await import("./store.js")).default;
});

describe("accounts", () => {
  it("reports created, unchanged and renamed, bumping the revision only on change", async () => {
    expect(await store.register("g1", "alice", "Alice")).toBe("created");
    expect(await store.register("g1", "alice", "Alice")).toBe("unchanged");
    expect(store.revision("g1")).toBe(1);
    expect(await store.register("g1", "alice", "Alicia")).toBe("renamed");
    expect(store.revision("g1")).toBe(2);
    expect(store.revision("other")).toBe(0);
  });

  it("drops the rolls of an account when it is renamed", async () => {
    await seed(alice, remote("r1", 10));
    await seed(bob, remote("r2", 20));

    await store.register("g1", "alice", "Alicia");

    expect(await scores()).toEqual([20]);
  });

  it("unregisters an account with its rolls, true only when something was removed", async () => {
    await seed(alice, remote("r1", 10));
    const revision = store.revision("g1");

    expect(await store.unregister("g1", "alice")).toBe(true);
    expect(await scores()).toEqual([]);
    expect(await store.account("g1", "alice")).toBeNull();
    expect(await store.unregister("g1", "alice")).toBe(false);
    expect(store.revision("g1")).toBe(revision + 1);
  });

  it("deletes everything kept about a member on one guild only", async () => {
    await seed(alice, remote("r1", 10));
    await seed(bob, remote("r2", 20));
    await seed(account("g2", "alice"), remote("r3", 30));
    await store.setReminder("g1", "alice", true);
    await store.claimCard("g1", "alice", new Date(Date.UTC(2026, 0, 1)));
    await store.claimCard("g2", "alice", new Date(Date.UTC(2026, 0, 1)));
    const revision = store.revision("g1");

    await store.deleteMember("g1", "alice");

    expect(await store.account("g1", "alice")).toBeNull();
    expect(await scores()).toEqual([20]);
    expect(db.state.reminders).toEqual([]);
    expect(db.state.claims.map((row) => row["guildId"])).toEqual(["g2"]);
    expect(await store.account("g2", "alice")).not.toBeNull();
    expect(await scores("g2")).toEqual([30]);
    expect(store.revision("g1")).toBe(revision + 1);
  });

  it("lists accounts by username and finds them case-insensitively within a guild", async () => {
    await store.register("g1", "u2", "zed");
    await store.register("g1", "u1", "Amy");
    await store.register("g2", "u3", "Amy");

    const list = await store.accounts("g1");
    expect(list.map((a) => a.username)).toEqual(["Amy", "zed"]);
    expect((await store.accountByUsername("g1", "ZED"))?.userId).toBe("u2");
    expect(await store.accountByUsername("g1", "nobody")).toBeNull();
  });
});

describe("reminders", () => {
  const today = new Date(Date.UTC(2026, 0, 2));

  it("subscribes idempotently and unsubscribes", async () => {
    await store.setReminder("g1", "alice", true);
    await store.setReminder("g1", "alice", true);
    expect(db.state.reminders).toEqual([{ guildId: "g1", userId: "alice" }]);

    await store.setReminder("g1", "alice", false);
    await store.setReminder("g1", "alice", false);
    expect(db.state.reminders).toEqual([]);
  });

  it("forgets a subscription left behind by an earlier account on a new link", async () => {
    await store.setReminder("g1", "alice", true);
    await store.register("g1", "alice", "Alice");
    expect(db.state.reminders).toEqual([]);

    await store.setReminder("g1", "alice", true);
    await store.register("g1", "alice", "Alicia");
    expect(db.state.reminders).toEqual([{ guildId: "g1", userId: "alice" }]);
  });

  it("drops the subscription when unregistering, on that guild only", async () => {
    await seed(alice);
    await store.setReminder("g1", "alice", true);
    await store.setReminder("g2", "alice", true);

    await store.unregister("g1", "alice");

    expect(db.state.reminders).toEqual([{ guildId: "g2", userId: "alice" }]);
  });

  it("returns linked subscribers of the guild without a roll since the given day", async () => {
    await seed(alice, remote("r1", 10, 0, 1));
    await seed(bob, remote("r2", 20, 0, 2));
    await seed(account("g1", "carl"));
    await seed(zoe);
    for (const userId of ["carl", "bob", "alice", "ghost"]) {
      await store.setReminder("g1", userId, true);
    }
    await store.setReminder("g2", "zoe", true);

    expect(await store.pendingReminders("g1", today)).toEqual([
      "alice",
      "carl",
    ]);
    expect(await store.pendingReminders("g2", today)).toEqual(["zoe"]);
    expect(await store.pendingReminders("g3", today)).toEqual([]);
  });

  it("ignores a subscription made on another guild", async () => {
    await seed(alice);
    await seed(account("g2", "alice"));
    await store.setReminder("g2", "alice", true);

    expect(await store.pendingReminders("g1", today)).toEqual([]);
    expect(await store.pendingReminders("g2", today)).toEqual(["alice"]);
  });
});

describe("rolls", () => {
  it("inserts new rolls, updates a changed score or badgeCount, ignores identical ones", async () => {
    await seed(
      alice,
      remote("r1", 10),
      remote("r2", 20, 1),
      remote("r3", 30, 2)
    );
    const revision = store.revision("g1");

    expect(await store.saveRolls(alice, [])).toEqual({
      inserted: 0,
      updated: 0,
    });
    expect(await store.saveRolls(alice, [remote("r1", 10)])).toEqual({
      inserted: 0,
      updated: 0,
    });
    expect(store.revision("g1")).toBe(revision);

    const result = await store.saveRolls(alice, [
      remote("r2", 20, 5),
      remote("r3", 31, 2),
      remote("r4", 40, 0, 4),
    ]);

    expect(result).toEqual({ inserted: 1, updated: 2 });
    expect(store.revision("g1")).toBe(revision + 1);
    const stored = await store.rolls("g1");
    expect(stored.map((r) => [r.score, r.badgeCount])).toEqual([
      [10, 0],
      [20, 5],
      [31, 2],
      [40, 0],
    ]);
    expect(typeof stored[0]!.score).toBe("number");
  });

  it("finds the latest roll date of a user", async () => {
    await seed(
      alice,
      remote("r1", 10, 0, 1),
      remote("r2", 20, 0, 3),
      remote("r3", 5, 0, 2)
    );

    expect(await store.latestRollDate("g1", "alice")).toEqual(
      new Date(Date.UTC(2026, 0, 3))
    );
    expect(await store.latestRollDate("g1", "bob")).toBeNull();
  });

  it("filters by user and by a half-open date range, and orders by score then date", async () => {
    await seed(alice, remote("a1", 50, 0, 1), remote("a2", 70, 0, 2));
    await seed(bob, remote("b1", 70, 0, 1), remote("b2", 10, 0, 3));
    const range = {
      from: new Date(Date.UTC(2026, 0, 1)),
      to: new Date(Date.UTC(2026, 0, 3)),
    };

    expect(await scores("g1", { userId: "bob" })).toEqual([70, 10]);
    expect(await scores("g1", range)).toEqual([50, 70, 70]);
    const ranked = await store.rolls("g1", { ...range, byScore: true });
    expect(ranked.map((r) => r.userId)).toEqual(["bob", "alice", "alice"]);
  });

  it("clears the rolls of one guild only, keeping the accounts", async () => {
    await seed(alice, remote("a1", 5));
    await seed(zoe, remote("z1", 5));
    const revision = store.revision("g1");

    expect(await store.clearRolls("g1")).toBe(1);

    expect(await scores("g1")).toHaveLength(0);
    expect(await scores("g2")).toHaveLength(1);
    expect(await store.accounts("g1")).toHaveLength(1);
    expect(store.revision("g1")).toBe(revision + 1);
  });
});

describe("score table", () => {
  const stored = Object.fromEntries(
    Array.from({ length: 25 }, (_, i) => [String(i * 100), i * 4])
  );

  it("uses the stored table when it is valid", async () => {
    db.state.table = { id: 1, data: stored };

    expect((await store.scoreTable()).compressed).toEqual(stored);
  });

  it.each([
    ["missing", null],
    ["not numeric", { id: 1, data: { ...stored, "5": "x" } }],
    ["not monotonic", { id: 1, data: { ...stored, "0": 99 } }],
  ])(
    "falls back to the bundled snapshot when the stored table is %s",
    async (_label, row) => {
      db.state.table = row;

      const { compressed } = await store.scoreTable();

      expect(compressed).not.toEqual(stored);
      expect(Object.keys(compressed).length).toBeGreaterThan(20);
    }
  );

  it("replaces the table only when it differs", async () => {
    db.state.table = { id: 1, data: stored };

    expect(await store.replaceScoreTable({ ...stored })).toBe(false);

    const updated = { ...stored, "0": 1 };
    expect(await store.replaceScoreTable(updated)).toBe(true);
    expect(db.state.table!["data"]).toEqual(updated);
    expect((await store.scoreTable()).compressed).toEqual(updated);
  });
});
