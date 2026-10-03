import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sleep: vi.fn((): Promise<void> => new Promise(() => {})),
  activated: vi.fn(async (_module: string): Promise<string[]> => []),
  accounts: vi.fn(),
  latestRollDate: vi.fn(),
  saveRolls: vi.fn(),
  fetchUserRolls: vi.fn(),
}));

vi.mock("node:timers/promises", () => ({ setTimeout: mocks.sleep }));
vi.mock("#lib/logger.js", () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { loggerMaker: () => logger };
});
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: mocks.activated },
}));
vi.mock("./store.js", () => ({
  default: {
    accounts: mocks.accounts,
    latestRollDate: mocks.latestRollDate,
    saveRolls: mocks.saveRolls,
  },
}));
vi.mock("./api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api.js")>()),
  fetchUserRolls: mocks.fetchUserRolls,
}));

import { RngdleUserNotFoundError } from "./api.js";
import sync, { FullSyncCooldownError } from "./sync.js";

const MINUTE = 60_000;
const NOW = new Date("2026-03-10T12:00:00Z");

function accountsOf(guildId: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    guildId,
    userId: `u${i}`,
    username: `user${i}`,
  }));
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

let guild = 0;
let guildId: string;

beforeEach(() => {
  guildId = `g${++guild}`;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.sleep.mockClear();
  mocks.accounts.mockReset().mockResolvedValue(accountsOf(guildId, 2));
  mocks.latestRollDate.mockReset().mockResolvedValue(null);
  mocks.saveRolls.mockReset().mockResolvedValue({ inserted: 1, updated: 2 });
  mocks.fetchUserRolls.mockReset().mockResolvedValue([]);
  mocks.activated.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncGuild", () => {
  it("aggregates the report and counts failures without stopping the other accounts", async () => {
    mocks.accounts.mockResolvedValue(accountsOf(guildId, 3));
    mocks.fetchUserRolls.mockImplementation(async (username: string) => {
      if (username === "user0") throw new RngdleUserNotFoundError(username);
      if (username === "user1") throw new Error("boom");
      return [];
    });

    expect(await sync.syncGuild(guildId)).toEqual({
      accounts: 3,
      inserted: 1,
      updated: 2,
      failed: 2,
    });
  });

  it("fetches only what is newer than the latest stored roll", async () => {
    const latest = new Date("2026-03-09T20:00:00Z");
    mocks.latestRollDate.mockResolvedValue(latest);

    await sync.syncGuild(guildId);

    expect(mocks.fetchUserRolls).toHaveBeenCalledWith("user0", latest);
  });

  it("skips accounts whose latest roll is today (UTC), unless the sync is full", async () => {
    mocks.latestRollDate.mockResolvedValue(new Date("2026-03-10T00:00:00Z"));

    expect(await sync.syncGuild(guildId)).toMatchObject({
      inserted: 0,
      updated: 0,
    });
    expect(mocks.fetchUserRolls).not.toHaveBeenCalled();

    await sync.syncGuild(guildId, true);
    expect(mocks.fetchUserRolls).toHaveBeenCalledWith("user0", null);
  });

  it("limits a guild to 4 parallel fetches", async () => {
    mocks.accounts.mockResolvedValue(accountsOf(guildId, 10));
    let active = 0;
    let peak = 0;
    mocks.fetchUserRolls.mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await tick();
      active -= 1;
      return [];
    });

    await sync.syncGuild(guildId);

    expect(mocks.fetchUserRolls).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
  });

  it("reuses the pending sync of a guild", async () => {
    const first = sync.syncGuild(guildId);
    const second = sync.syncGuild(guildId);

    expect(second).toBe(first);
    await first;
    expect(mocks.accounts).toHaveBeenCalledTimes(1);
  });

  it("rejects a second full sync within 15 minutes, per guild, with the retry date", async () => {
    await sync.syncGuild(guildId, true);
    vi.setSystemTime(NOW.getTime() + 14 * MINUTE);

    const error = await sync.syncGuild(guildId, true).catch((err) => err);
    expect(error).toBeInstanceOf(FullSyncCooldownError);
    expect(error.retryAt).toEqual(new Date(NOW.getTime() + 15 * MINUTE));
    await expect(
      sync.syncGuild(`${guildId}-other`, true)
    ).resolves.toBeDefined();

    vi.setSystemTime(NOW.getTime() + 15 * MINUTE);
    await expect(sync.syncGuild(guildId, true)).resolves.toBeDefined();
  });
});

describe("syncAll", () => {
  it("syncs only the guilds where the module is activated and sums their reports", async () => {
    const other = `${guildId}-b`;
    mocks.activated.mockResolvedValue([guildId, other]);

    const report = await sync.syncAll();

    expect(mocks.activated).toHaveBeenCalledWith("rngdle");
    expect(mocks.accounts.mock.calls.map(([id]) => id)).toEqual([
      guildId,
      other,
    ]);
    expect(report).toEqual({ accounts: 4, inserted: 4, updated: 8, failed: 0 });
  });
});

describe("refreshIfStale", () => {
  it("syncs when stale and not again within 5 minutes", async () => {
    await sync.refreshIfStale(guildId);
    await sync.refreshIfStale(guildId);
    expect(mocks.accounts).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW.getTime() + 5 * MINUTE);
    await sync.refreshIfStale(guildId);
    expect(mocks.accounts).toHaveBeenCalledTimes(2);
  });

  it("joins a sync that is still running instead of starting another", async () => {
    let release!: () => void;
    mocks.fetchUserRolls.mockReturnValue(
      new Promise((resolve) => (release = () => resolve([])))
    );
    const running = sync.syncGuild(guildId);
    vi.setSystemTime(NOW.getTime() + 6 * MINUTE);

    const refresh = sync.refreshIfStale(guildId);
    await tick();
    release();
    await Promise.all([running, refresh]);

    expect(mocks.accounts).toHaveBeenCalledTimes(1);
  });

  it("never waits more than 10 seconds for a slow sync", async () => {
    mocks.fetchUserRolls.mockReturnValue(new Promise(() => {}));
    mocks.sleep.mockResolvedValueOnce(undefined);

    await sync.refreshIfStale(guildId);

    expect(mocks.sleep.mock.calls[0]).toContain(10_000);
  });

  it("resolves even when the sync fails", async () => {
    mocks.accounts.mockRejectedValue(new Error("db down"));

    await expect(sync.refreshIfStale(guildId)).resolves.toBeUndefined();
  });
});
