import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteRoll } from "./rngdle-api.js";

interface AccountRow {
  guildId: string;
  userId: string;
  username: string;
}

interface RollRow {
  guildId: string;
  userId: string;
  rollId: string;
  number: number;
  score: bigint;
  badgeCount: number;
  rolledAt: Date;
}

const db = vi.hoisted(() => ({
  accounts: new Map<string, unknown>(),
  rolls: [] as unknown[],
}));

const accounts = db.accounts as Map<string, AccountRow>;
const accountKey = (guildId: string, userId: string) => `${guildId}:${userId}`;

function rolls() {
  return db.rolls as RollRow[];
}

vi.mock("#lib/database.js", () => ({
  default: {
    async $transaction(operations: Promise<unknown>[]) {
      return Promise.all(operations);
    },
    rngdleAccount: {
      async findUnique({
        where,
      }: {
        where: { guildId_userId: { guildId: string; userId: string } };
      }) {
        const { guildId, userId } = where.guildId_userId;
        return accounts.get(accountKey(guildId, userId)) ?? null;
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { guildId_userId: { guildId: string; userId: string } };
        create: AccountRow;
        update: Partial<AccountRow>;
      }) {
        const { guildId, userId } = where.guildId_userId;
        const key = accountKey(guildId, userId);
        const existing = accounts.get(key);
        const row = existing ? { ...existing, ...update } : create;
        accounts.set(key, row);
        return row;
      },
      async deleteMany({
        where,
      }: {
        where: { guildId: string; userId: string };
      }) {
        const removed = accounts.delete(
          accountKey(where.guildId, where.userId)
        );
        return { count: removed ? 1 : 0 };
      },
    },
    rngdleRoll: {
      async deleteMany({
        where,
      }: {
        where: { guildId: string; userId?: string };
      }) {
        const before = rolls().length;
        db.rolls = rolls().filter(
          (row) =>
            !(
              row.guildId === where.guildId &&
              (where.userId === undefined || row.userId === where.userId)
            )
        );
        return { count: before - rolls().length };
      },
      async findMany({
        where,
        orderBy,
      }: {
        where: {
          guildId: string;
          userId?: string;
          rollId?: { in: string[] };
          rolledAt?: { gte: Date; lt: Date };
        };
        orderBy?: unknown;
      }) {
        const matching = rolls().filter(
          (row) =>
            row.guildId === where.guildId &&
            (where.userId === undefined || row.userId === where.userId) &&
            (where.rollId === undefined ||
              where.rollId.in.includes(row.rollId)) &&
            (where.rolledAt === undefined ||
              (row.rolledAt >= where.rolledAt.gte &&
                row.rolledAt < where.rolledAt.lt))
        );
        if (Array.isArray(orderBy)) {
          matching.sort(
            (a, b) =>
              Number(b.score - a.score) ||
              a.rolledAt.getTime() - b.rolledAt.getTime()
          );
        } else if (orderBy) {
          matching.sort((a, b) => a.rolledAt.getTime() - b.rolledAt.getTime());
        }
        return matching.map((row) => ({ ...row }));
      },
      async groupBy({ where }: { where: { guildId: string } }) {
        const sums = new Map<string, bigint>();
        for (const row of rolls()) {
          if (row.guildId === where.guildId) {
            sums.set(row.userId, (sums.get(row.userId) ?? 0n) + row.score);
          }
        }
        return [...sums].map(([userId, sum]) => ({
          userId,
          _sum: { score: sum },
        }));
      },
      async createMany({
        data,
        skipDuplicates,
      }: {
        data: RollRow[];
        skipDuplicates?: boolean;
      }) {
        let count = 0;
        for (const row of data) {
          const duplicate = rolls().some(
            (existing) =>
              existing.guildId === row.guildId && existing.rollId === row.rollId
          );
          if (duplicate) {
            if (!skipDuplicates) throw new Error("unique constraint");
            continue;
          }
          rolls().push({ ...row });
          count++;
        }
        return { count };
      },
      async update({
        where,
        data,
      }: {
        where: { guildId_rollId: { guildId: string; rollId: string } };
        data: Partial<RollRow>;
      }) {
        const { guildId, rollId } = where.guildId_rollId;
        const row = rolls().find(
          (existing) =>
            existing.guildId === guildId && existing.rollId === rollId
        );
        if (!row) throw new Error("record not found");
        Object.assign(row, data);
        return row;
      },
    },
  },
}));

const { default: service } = await import("./rngdle.service.js");

let guild = 0;
let guildId = "";

beforeEach(() => {
  db.accounts.clear();
  db.rolls = [];
  guildId = `guild-${++guild}`;
});

const account = (userId: string, id = guildId) => ({
  guildId: id,
  userId,
  username: `name-${userId}`,
});

function remote(
  id: string,
  score = 100,
  badgeCount = 0,
  number = 1
): RemoteRoll {
  return {
    id,
    number,
    score,
    badgeCount,
    rolledAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function rollIds(forGuild = guildId, userId?: string) {
  return rolls()
    .filter(
      (row) =>
        row.guildId === forGuild &&
        (userId === undefined || row.userId === userId)
    )
    .map((row) => row.rollId)
    .sort();
}

describe("register", () => {
  it("creates an account", async () => {
    await expect(service.register(guildId, "u1", "alice")).resolves.toBe(
      "created"
    );

    expect(accounts.get(accountKey(guildId, "u1"))?.username).toBe("alice");
  });

  it("is unchanged when the username is the same", async () => {
    await service.register(guildId, "u1", "alice");
    const revision = service.getRevision(guildId);
    await service.saveRolls(account("u1"), [remote("r1")]);
    const afterSave = service.getRevision(guildId);

    await expect(service.register(guildId, "u1", "alice")).resolves.toBe(
      "unchanged"
    );

    expect(rollIds()).toEqual(["r1"]);
    expect(service.getRevision(guildId)).toBe(afterSave);
    expect(afterSave).toBeGreaterThan(revision);
  });

  it("renames the account and deletes the previous rolls of that guild only", async () => {
    const other = `${guildId}-other`;
    await service.register(guildId, "u1", "alice");
    await service.register(other, "u1", "alice");
    await service.register(guildId, "u2", "bob");
    await service.saveRolls(account("u1"), [remote("a1"), remote("a2")]);
    await service.saveRolls(account("u1", other), [remote("b1")]);
    await service.saveRolls(account("u2"), [remote("c1")]);

    await expect(service.register(guildId, "u1", "alice2")).resolves.toBe(
      "renamed"
    );

    expect(accounts.get(accountKey(guildId, "u1"))?.username).toBe("alice2");
    expect(rollIds(guildId, "u1")).toEqual([]);
    expect(rollIds(guildId, "u2")).toEqual(["c1"]);
    expect(rollIds(other, "u1")).toEqual(["b1"]);
  });

  it("bumps the revision when something changes", async () => {
    const before = service.getRevision(guildId);

    await service.register(guildId, "u1", "alice");

    expect(service.getRevision(guildId)).toBeGreaterThan(before);
  });
});

describe("unregister", () => {
  it("deletes the account and its rolls", async () => {
    await service.register(guildId, "u1", "alice");
    await service.register(guildId, "u2", "bob");
    await service.saveRolls(account("u1"), [remote("a1")]);
    await service.saveRolls(account("u2"), [remote("c1")]);
    const before = service.getRevision(guildId);

    await expect(service.unregister(guildId, "u1")).resolves.toBe(true);

    expect(accounts.has(accountKey(guildId, "u1"))).toBe(false);
    expect(rollIds()).toEqual(["c1"]);
    expect(service.getRevision(guildId)).toBeGreaterThan(before);
  });

  it("returns false and keeps the revision when the account is absent", async () => {
    const before = service.getRevision(guildId);

    await expect(service.unregister(guildId, "ghost")).resolves.toBe(false);

    expect(service.getRevision(guildId)).toBe(before);
  });
});

describe("saveRolls", () => {
  beforeEach(async () => {
    await service.register(guildId, "u1", "alice");
  });

  it("returns zeros for an empty list without touching the revision", async () => {
    const before = service.getRevision(guildId);

    await expect(service.saveRolls(account("u1"), [])).resolves.toEqual({
      inserted: 0,
      updated: 0,
    });

    expect(service.getRevision(guildId)).toBe(before);
  });

  it("inserts new rolls with their owner", async () => {
    const result = await service.saveRolls(account("u1"), [
      remote("r1", 10, 1, 5),
      remote("r2", 20),
    ]);

    expect(result).toEqual({ inserted: 2, updated: 0 });
    expect(rolls()).toHaveLength(2);
    expect(rolls()[0]).toMatchObject({
      guildId,
      userId: "u1",
      rollId: "r1",
      number: 5,
      score: 10n,
      badgeCount: 1,
    });
  });

  it("updates only the rolls whose score or badge count changed", async () => {
    await service.saveRolls(account("u1"), [
      remote("r1", 10, 0),
      remote("r2", 20, 0),
      remote("r3", 30, 0),
    ]);

    const result = await service.saveRolls(account("u1"), [
      remote("r1", 10, 0),
      remote("r2", 21, 0),
      remote("r3", 30, 2),
      remote("r4", 40, 0),
    ]);

    expect(result).toEqual({ inserted: 1, updated: 2 });
    const byId = new Map(rolls().map((row) => [row.rollId, row]));
    expect(byId.get("r1")).toMatchObject({ score: 10n, badgeCount: 0 });
    expect(byId.get("r2")).toMatchObject({ score: 21n, badgeCount: 0 });
    expect(byId.get("r3")).toMatchObject({ score: 30n, badgeCount: 2 });
    expect(byId.get("r4")).toMatchObject({ score: 40n, badgeCount: 0 });
  });

  it("is idempotent", async () => {
    const batch = [remote("r1", 10, 1), remote("r2", 20, 0)];
    await service.saveRolls(account("u1"), batch);
    const revision = service.getRevision(guildId);

    const result = await service.saveRolls(account("u1"), batch);

    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(rolls()).toHaveLength(2);
    expect(service.getRevision(guildId)).toBe(revision);
  });

  it("treats the same roll id in another guild as a new roll", async () => {
    const other = `${guildId}-other`;
    await service.saveRolls(account("u1"), [remote("r1")]);

    const result = await service.saveRolls(account("u1", other), [
      remote("r1"),
    ]);

    expect(result).toEqual({ inserted: 1, updated: 0 });
    expect(rolls()).toHaveLength(2);
  });
});

describe("getRevision", () => {
  it("starts at 0 and is tracked per guild", async () => {
    const other = `${guildId}-other`;

    expect(service.getRevision(guildId)).toBe(0);

    await service.register(guildId, "u1", "alice");

    expect(service.getRevision(guildId)).toBe(1);
    expect(service.getRevision(other)).toBe(0);
  });

  it("increases on every data change", async () => {
    const seen = [service.getRevision(guildId)];
    const record = () => seen.push(service.getRevision(guildId));

    await service.register(guildId, "u1", "alice");
    record();
    await service.saveRolls(account("u1"), [remote("r1", 10)]);
    record();
    await service.saveRolls(account("u1"), [remote("r1", 11)]);
    record();
    await service.clearRolls(guildId);
    record();
    await service.unregister(guildId, "u1");
    record();

    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("clearRolls", () => {
  it("only removes the rolls of its guild and keeps accounts", async () => {
    const other = `${guildId}-other`;
    await service.register(guildId, "u1", "alice");
    await service.register(other, "u1", "alice");
    await service.saveRolls(account("u1"), [remote("a1"), remote("a2")]);
    await service.saveRolls(account("u1", other), [remote("b1")]);
    const otherRevision = service.getRevision(other);

    await expect(service.clearRolls(guildId)).resolves.toBe(2);

    expect(rollIds(guildId)).toEqual([]);
    expect(rollIds(other)).toEqual(["b1"]);
    expect(accounts.has(accountKey(guildId, "u1"))).toBe(true);
    expect(service.getRevision(other)).toBe(otherRevision);
  });
});

describe("bigint scores", () => {
  const BIG = 9_007_199_254_740_000;

  beforeEach(async () => {
    await service.register(guildId, "u1", "alice");
    await service.register(guildId, "u2", "bob");
  });

  const at = (id: string, score: number, day: number): RemoteRoll => ({
    id,
    number: day,
    score,
    badgeCount: 0,
    rolledAt: new Date(Date.UTC(2026, 0, day)),
  });

  it("stores scores as bigint", async () => {
    await service.saveRolls(account("u1"), [at("r1", 5_000_000_000, 1)]);

    expect(rolls()[0]!.score).toBe(5_000_000_000n);
  });

  it("returns scores as numbers from userRolls and guildRolls", async () => {
    await service.saveRolls(account("u1"), [
      at("r1", 5_000_000_000, 1),
      at("r2", 7, 2),
    ]);
    await service.saveRolls(account("u2"), [at("r3", BIG, 3)]);

    const user = await service.userRolls(guildId, "u1");
    const all = await service.guildRolls(guildId);

    expect(user.map((roll) => roll.score)).toEqual([5_000_000_000, 7]);
    expect(all.map((roll) => roll.score)).toEqual([5_000_000_000, 7, BIG]);
    expect(typeof all[0]!.score).toBe("number");
  });

  it("returns scores as numbers from rollsBetween, best first", async () => {
    await service.saveRolls(account("u1"), [
      at("r1", 10, 1),
      at("r2", 5_000_000_000, 2),
      at("r3", 99, 5),
    ]);

    const between = await service.rollsBetween(
      guildId,
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 0, 3))
    );

    expect(between.map((roll) => roll.score)).toEqual([5_000_000_000, 10]);
  });

  it("compares stored bigint with incoming number when saving", async () => {
    await service.saveRolls(account("u1"), [at("r1", 5_000_000_000, 1)]);
    const revision = service.getRevision(guildId);

    const same = await service.saveRolls(account("u1"), [
      at("r1", 5_000_000_000, 1),
    ]);
    const changed = await service.saveRolls(account("u1"), [
      at("r1", 5_000_000_001, 1),
    ]);

    expect(same).toEqual({ inserted: 0, updated: 0 });
    expect(changed).toEqual({ inserted: 0, updated: 1 });
    expect(rolls()[0]!.score).toBe(5_000_000_001n);
    expect(service.getRevision(guildId)).toBe(revision + 1);
  });

  it("sums totals as numbers, best user first", async () => {
    await service.saveRolls(account("u1"), [
      at("r1", 4_000_000_000, 1),
      at("r2", 4_000_000_000, 2),
    ]);
    await service.saveRolls(account("u2"), [at("r3", 100, 3)]);

    await expect(service.totalsByUser(guildId)).resolves.toEqual([
      { userId: "u1", total: 8_000_000_000 },
      { userId: "u2", total: 100 },
    ]);
  });
});
