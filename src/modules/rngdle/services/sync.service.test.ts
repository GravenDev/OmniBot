import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteRoll } from "./rngdle-api.js";
import type { Account } from "./rngdle.service.js";

const mocks = vi.hoisted(() => ({
  fetchUserRolls: vi.fn(),
  listAccounts: vi.fn(),
  listAllAccounts: vi.fn(),
  getActivatedGuildIds: vi.fn(),
  latestRollDate: vi.fn(),
  saveRolls: vi.fn(),
}));

vi.mock("#lib/logger.js", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { loggerMaker: () => logger };
});

vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: mocks.getActivatedGuildIds },
}));

vi.mock("./rngdle-api.js", async () => {
  const actual =
    await vi.importActual<typeof import("./rngdle-api.js")>("./rngdle-api.js");
  return { ...actual, fetchUserRolls: mocks.fetchUserRolls };
});

vi.mock("./rngdle.service.js", () => ({
  default: {
    listAccounts: mocks.listAccounts,
    listAllAccounts: mocks.listAllAccounts,
    latestRollDate: mocks.latestRollDate,
    saveRolls: mocks.saveRolls,
  },
}));

const { RngdleUserNotFoundError } = await import("./rngdle-api.js");
const { default: sync, FullSyncCooldownError } =
  await import("./sync.service.js");

const NOW = new Date("2026-05-15T12:00:00.000Z");
let guild = 0;
let guildId = "";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function accountsFor(id: string, ...names: string[]): Account[] {
  return names.map((name) => ({
    guildId: id,
    userId: `u-${name}`,
    username: name,
  }));
}

interface Pending {
  username: string;
  since: Date | null;
  resolve: (rolls: RemoteRoll[]) => void;
  reject: (error: unknown) => void;
}

function deferFetches() {
  const pending: Pending[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  mocks.fetchUserRolls.mockImplementation(
    (username: string, since: Date | null) =>
      new Promise<RemoteRoll[]>((resolve, reject) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        pending.push({
          username,
          since,
          resolve: (rolls) => {
            inFlight--;
            resolve(rolls);
          },
          reject: (error) => {
            inFlight--;
            reject(error);
          },
        });
      })
  );
  return {
    pending,
    get maxInFlight() {
      return maxInFlight;
    },
    async drain() {
      for (let i = 0; i < 100; i++) {
        await flush();
        const next = pending.shift();
        if (!next) {
          if (i > 3) return;
          continue;
        }
        next.resolve([]);
      }
    },
  };
}

beforeEach(() => {
  guildId = `guild-${++guild}`;
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.latestRollDate.mockResolvedValue(null);
  mocks.fetchUserRolls.mockResolvedValue([]);
  mocks.saveRolls.mockResolvedValue({ inserted: 0, updated: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncGuild", () => {
  it("fetches, saves and reports", async () => {
    const rolls: RemoteRoll[] = [
      { id: "r1", number: 1, score: 1, badgeCount: 0, rolledAt: NOW },
      { id: "r2", number: 2, score: 2, badgeCount: 0, rolledAt: NOW },
    ];
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice", "bob"));
    mocks.fetchUserRolls.mockResolvedValue(rolls);
    mocks.saveRolls.mockResolvedValue({ inserted: 1, updated: 2 });

    const report = await sync.syncGuild(guildId);

    expect(report).toEqual({
      accounts: 2,
      fetched: 4,
      inserted: 2,
      updated: 4,
      failed: 0,
    });
    expect(mocks.listAccounts).toHaveBeenCalledWith(guildId);
    expect(mocks.saveRolls).toHaveBeenCalledTimes(2);
  });

  it("passes the latest stored roll date as since", async () => {
    const latest = new Date("2026-05-14T08:00:00.000Z");
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    mocks.latestRollDate.mockResolvedValue(latest);

    await sync.syncGuild(guildId);

    expect(mocks.fetchUserRolls).toHaveBeenCalledWith("alice", latest);
  });

  it("skips an account whose latest roll is today (UTC)", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    mocks.latestRollDate.mockResolvedValue(
      new Date("2026-05-15T00:00:00.000Z")
    );

    const report = await sync.syncGuild(guildId);

    expect(mocks.fetchUserRolls).not.toHaveBeenCalled();
    expect(mocks.saveRolls).not.toHaveBeenCalled();
    expect(report).toEqual({
      accounts: 1,
      fetched: 0,
      inserted: 0,
      updated: 0,
      failed: 0,
    });
  });

  it("does not skip an account whose latest roll is just before today", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    mocks.latestRollDate.mockResolvedValue(
      new Date("2026-05-14T23:59:59.999Z")
    );

    await sync.syncGuild(guildId);

    expect(mocks.fetchUserRolls).toHaveBeenCalledTimes(1);
  });

  it("fetches everything with full and does not read the latest roll", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    mocks.latestRollDate.mockResolvedValue(NOW);

    await sync.syncGuild(guildId, { full: true });

    expect(mocks.latestRollDate).not.toHaveBeenCalled();
    expect(mocks.fetchUserRolls).toHaveBeenCalledWith("alice", null);
  });

  it("counts a failure per account without stopping the others", async () => {
    mocks.listAccounts.mockResolvedValue(
      accountsFor(guildId, "ghost", "broken", "alice", "bob")
    );
    mocks.fetchUserRolls.mockImplementation(async (username: string) => {
      if (username === "ghost") throw new RngdleUserNotFoundError(username);
      if (username === "broken") throw new Error("network down");
      return [
        { id: username, number: 1, score: 1, badgeCount: 0, rolledAt: NOW },
      ];
    });
    mocks.saveRolls.mockResolvedValue({ inserted: 1, updated: 0 });

    const report = await sync.syncGuild(guildId);

    expect(report).toEqual({
      accounts: 4,
      fetched: 2,
      inserted: 2,
      updated: 0,
      failed: 2,
    });
  });

  it("counts a save failure as one failure", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    mocks.saveRolls.mockRejectedValue(new Error("db down"));

    const report = await sync.syncGuild(guildId);

    expect(report.failed).toBe(1);
  });

  it("runs at most 4 fetches concurrently", async () => {
    const names = Array.from({ length: 10 }, (_, i) => `user${i}`);
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, ...names));
    const fetches = deferFetches();

    const done = sync.syncGuild(guildId);
    await flush();
    expect(fetches.pending).toHaveLength(4);

    await fetches.drain();
    const report = await done;

    expect(fetches.maxInFlight).toBe(4);
    expect(mocks.fetchUserRolls).toHaveBeenCalledTimes(10);
    expect(report.accounts).toBe(10);
  });

  it("handles a guild without accounts", async () => {
    mocks.listAccounts.mockResolvedValue([]);

    await expect(sync.syncGuild(guildId)).resolves.toEqual({
      accounts: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      failed: 0,
    });
  });
});

const MINUTE = 60 * 1000;

describe("per-guild exclusivity", () => {
  it("never overlaps two syncs of the same guild", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    const fetches = deferFetches();

    const first = sync.syncGuild(guildId);
    const second = sync.syncGuild(guildId, { full: true });
    await flush();

    expect(fetches.pending).toHaveLength(1);
    fetches.pending.shift()!.resolve([]);
    await first;
    await flush();
    expect(fetches.pending).toHaveLength(1);
    fetches.pending.shift()!.resolve([]);
    await second;
    expect(fetches.maxInFlight).toBe(1);
  });

  it("makes a queued task wait for an in-flight sync of the same guild", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    const fetches = deferFetches();
    const order: string[] = [];

    const syncing = sync.syncGuild(guildId).then(() => order.push("sync done"));
    await flush();
    const clearing = sync.runExclusive(guildId, async () => {
      order.push("clear");
    });
    await flush();

    expect(order).toEqual([]);
    fetches.pending.shift()!.resolve([]);
    await Promise.all([syncing, clearing]);

    expect(order).toEqual(["sync done", "clear"]);
  });

  it("does not block another guild", async () => {
    const other = `${guildId}-other`;
    mocks.listAccounts.mockImplementation(async (id: string) =>
      accountsFor(id, id === guildId ? "alice" : "bob")
    );
    const fetches = deferFetches();

    const blocked = sync.syncGuild(guildId);
    await flush();
    const otherTask = sync.runExclusive(other, async () => "ran");
    const otherSync = sync.syncGuild(other);
    await flush();

    await expect(otherTask).resolves.toBe("ran");
    expect(fetches.pending.map((p) => p.username).sort()).toEqual([
      "alice",
      "bob",
    ]);

    await fetches.drain();
    await Promise.all([blocked, otherSync]);
  });

  it("keeps running queued tasks after a failure", async () => {
    const failing = sync.runExclusive(guildId, async () => {
      throw new Error("boom");
    });
    const next = sync.runExclusive(guildId, async () => "ok");

    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });

  it("returns the task result", async () => {
    await expect(sync.runExclusive(guildId, async () => 42)).resolves.toBe(42);
  });
});

describe("pending sync reuse", () => {
  it("reuses a pending sync instead of starting a duplicate", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    const fetches = deferFetches();

    const first = sync.syncGuild(guildId);
    const second = sync.syncGuild(guildId);
    await flush();
    fetches.pending.shift()!.resolve([]);
    const [a, b] = await Promise.all([first, second]);

    expect(mocks.listAccounts).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it("starts a new sync once the previous one has finished", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));

    await sync.syncGuild(guildId);
    await flush();
    await sync.syncGuild(guildId);

    expect(mocks.listAccounts).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a pending sync for a full request", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    const fetches = deferFetches();

    const first = sync.syncGuild(guildId);
    const full = sync.syncGuild(guildId, { full: true });
    await flush();
    await fetches.drain();
    await Promise.all([first, full]);

    expect(mocks.listAccounts).toHaveBeenCalledTimes(2);
    expect(mocks.fetchUserRolls).toHaveBeenLastCalledWith("alice", null);
  });
});

describe("full sync cooldown", () => {
  beforeEach(() => {
    mocks.listAccounts.mockResolvedValue([]);
  });

  it("rejects a second full sync within 15 minutes with retryAt", async () => {
    await sync.syncGuild(guildId, { full: true });
    vi.setSystemTime(new Date(NOW.getTime() + 5 * MINUTE));

    const error = await sync
      .syncGuild(guildId, { full: true })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(FullSyncCooldownError);
    expect(
      (error as InstanceType<typeof FullSyncCooldownError>).retryAt
    ).toEqual(new Date(NOW.getTime() + 15 * MINUTE));
    expect(mocks.listAccounts).toHaveBeenCalledTimes(1);
  });

  it("rejects right up to the 15 minute mark and accepts after it", async () => {
    await sync.syncGuild(guildId, { full: true });

    vi.setSystemTime(new Date(NOW.getTime() + 15 * MINUTE - 1));
    await expect(
      sync.syncGuild(guildId, { full: true })
    ).rejects.toBeInstanceOf(FullSyncCooldownError);

    vi.setSystemTime(new Date(NOW.getTime() + 15 * MINUTE));
    await expect(
      sync.syncGuild(guildId, { full: true })
    ).resolves.toBeDefined();
  });

  it("does not limit a normal sync", async () => {
    await sync.syncGuild(guildId, { full: true });

    await expect(sync.syncGuild(guildId)).resolves.toBeDefined();
  });

  it("tracks guilds independently", async () => {
    await sync.syncGuild(guildId, { full: true });

    await expect(
      sync.syncGuild(`${guildId}-other`, { full: true })
    ).resolves.toBeDefined();
  });

  it("is not triggered by a normal sync", async () => {
    await sync.syncGuild(guildId);

    await expect(
      sync.syncGuild(guildId, { full: true })
    ).resolves.toBeDefined();
  });
});

describe("syncAll", () => {
  it("only syncs activated guilds, without listing every account", async () => {
    const other = `${guildId}-other`;
    mocks.getActivatedGuildIds.mockResolvedValue([guildId, other]);
    mocks.listAccounts.mockImplementation(async (id: string) =>
      accountsFor(id, "alice")
    );
    mocks.saveRolls.mockResolvedValue({ inserted: 3, updated: 1 });

    const report = await sync.syncAll();

    expect(mocks.getActivatedGuildIds).toHaveBeenCalledWith("rngdle");
    expect(mocks.listAccounts.mock.calls.map(([id]) => id)).toEqual([
      guildId,
      other,
    ]);
    expect(mocks.listAllAccounts).not.toHaveBeenCalled();
    expect(report).toEqual({
      accounts: 2,
      fetched: 0,
      inserted: 6,
      updated: 2,
      failed: 0,
    });
  });

  it("does nothing without activated guilds", async () => {
    mocks.getActivatedGuildIds.mockResolvedValue([]);

    await expect(sync.syncAll()).resolves.toEqual({
      accounts: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      failed: 0,
    });
    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });

  it("syncs guilds one after another", async () => {
    const other = `${guildId}-other`;
    mocks.getActivatedGuildIds.mockResolvedValue([guildId, other]);
    mocks.listAccounts.mockImplementation(async (id: string) =>
      accountsFor(id, id === guildId ? "alice" : "bob")
    );
    const fetches = deferFetches();

    const done = sync.syncAll();
    await flush();

    expect(fetches.pending.map((p) => p.username)).toEqual(["alice"]);
    expect(mocks.listAccounts).toHaveBeenCalledTimes(1);

    fetches.pending.shift()!.resolve([]);
    await flush();
    expect(fetches.pending.map((p) => p.username)).toEqual(["bob"]);
    fetches.pending.shift()!.resolve([]);
    await done;
  });

  it("waits for a running sync of the same guild", async () => {
    mocks.getActivatedGuildIds.mockResolvedValue([guildId]);
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    const fetches = deferFetches();

    const running = sync.syncGuild(guildId);
    await flush();
    const all = sync.syncAll();
    await flush();

    expect(fetches.pending).toHaveLength(1);
    fetches.pending.shift()!.resolve([]);
    await Promise.all([running, all]);
    expect(mocks.listAccounts).toHaveBeenCalledTimes(1);
  });

  it("passes full to each guild", async () => {
    mocks.getActivatedGuildIds.mockResolvedValue([guildId]);
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    mocks.latestRollDate.mockResolvedValue(NOW);

    await sync.syncAll({ full: true });

    expect(mocks.latestRollDate).not.toHaveBeenCalled();
    expect(mocks.fetchUserRolls).toHaveBeenCalledWith("alice", null);
  });

  it("marks synced guilds as fresh", async () => {
    mocks.getActivatedGuildIds.mockResolvedValue([guildId]);
    mocks.listAccounts.mockResolvedValue([]);
    await sync.syncAll();
    mocks.listAccounts.mockClear();

    await sync.syncGuildIfStale(guildId);

    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });
});

describe("syncGuildIfStale", () => {
  beforeEach(() => {
    mocks.listAccounts.mockResolvedValue([]);
  });

  it("syncs a guild that was never synced", async () => {
    await sync.syncGuildIfStale(guildId);

    expect(mocks.listAccounts).toHaveBeenCalledTimes(1);
  });

  it("skips within 5 minutes of the last sync", async () => {
    await sync.syncGuild(guildId);
    mocks.listAccounts.mockClear();

    vi.setSystemTime(new Date(NOW.getTime() + 5 * MINUTE - 1));
    await sync.syncGuildIfStale(guildId);

    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });

  it("syncs again once 5 minutes have passed", async () => {
    await sync.syncGuild(guildId);
    await flush();
    mocks.listAccounts.mockClear();

    vi.setSystemTime(new Date(NOW.getTime() + 5 * MINUTE));
    await sync.syncGuildIfStale(guildId);

    expect(mocks.listAccounts).toHaveBeenCalledTimes(1);
  });

  it("tracks guilds independently", async () => {
    await sync.syncGuild(guildId);
    mocks.listAccounts.mockClear();

    await sync.syncGuildIfStale(`${guildId}-other`);

    expect(mocks.listAccounts).toHaveBeenCalledWith(`${guildId}-other`);
  });

  it("reuses a pending sync", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    const fetches = deferFetches();

    const running = sync.syncGuild(guildId);
    await flush();
    const stale = sync.syncGuildIfStale(guildId);
    await flush();
    fetches.pending.shift()!.resolve([]);
    await Promise.all([running, stale]);

    expect(mocks.listAccounts).toHaveBeenCalledTimes(1);
  });

  it("waits for a quick sync and leaves no timer behind", async () => {
    await sync.syncGuildIfStale(guildId);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait for more than 10 s while the sync keeps running", async () => {
    mocks.listAccounts.mockResolvedValue(accountsFor(guildId, "alice"));
    const fetches = deferFetches();
    let resolved = false;

    const stale = sync.syncGuildIfStale(guildId).then(() => {
      resolved = true;
    });
    await flush();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await stale;
    expect(resolved).toBe(true);
    expect(fetches.pending).toHaveLength(1);

    fetches.pending.shift()!.resolve([]);
    await flush();
    expect(mocks.saveRolls).toHaveBeenCalledTimes(1);
  });

  it("swallows a failing sync", async () => {
    mocks.listAccounts.mockRejectedValue(new Error("db down"));

    await expect(sync.syncGuildIfStale(guildId)).resolves.toBeUndefined();
  });
});
