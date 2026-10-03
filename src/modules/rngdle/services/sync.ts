import { setTimeout as sleep } from "node:timers/promises";
import moduleService from "#core/services/module.service.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import { fetchUserRolls, RngdleUserNotFoundError } from "./api.js";
import store, { type Account } from "./store.js";

const logger = loggerMaker("rngdle");

const MAX_PARALLEL_FETCHES = 4;
const STALE_AFTER_MS = 5 * 60 * 1000;
const FULL_SYNC_COOLDOWN_MS = 15 * 60 * 1000;
const DISPLAY_WAIT_MS = 10_000;

export interface SyncReport {
  accounts: number;
  inserted: number;
  updated: number;
  failed: number;
}

export class FullSyncCooldownError extends Error {
  constructor(readonly retryAt: Date) {
    super("A full sync ran recently on this guild");
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

class RngdleSync implements Service {
  private readonly queue = new KeyedQueue();
  private readonly lastSync = new Map<string, number>();
  private readonly lastFullSync = new Map<string, number>();
  private readonly pending = new Map<string, Promise<SyncReport>>();

  exclusive<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    return this.queue.run(guildId, task);
  }

  syncGuild(guildId: string, full = false): Promise<SyncReport> {
    if (full) {
      const last = this.lastFullSync.get(guildId) ?? -Infinity;
      if (Date.now() - last < FULL_SYNC_COOLDOWN_MS) {
        return Promise.reject(
          new FullSyncCooldownError(new Date(last + FULL_SYNC_COOLDOWN_MS))
        );
      }
      this.lastFullSync.set(guildId, Date.now());
    }
    return this.start(guildId, full);
  }

  async syncAll(full = false): Promise<SyncReport> {
    const total: SyncReport = {
      accounts: 0,
      inserted: 0,
      updated: 0,
      failed: 0,
    };
    for (const guildId of await moduleService.getActivatedGuildIds("rngdle")) {
      const report = await this.start(guildId, full);
      total.accounts += report.accounts;
      total.inserted += report.inserted;
      total.updated += report.updated;
      total.failed += report.failed;
    }
    logger.info(
      `Sync done | accounts = ${total.accounts} | inserted = ${total.inserted} | updated = ${total.updated} | failed = ${total.failed}`
    );
    return total;
  }

  async refreshIfStale(guildId: string): Promise<void> {
    const fresh =
      Date.now() - (this.lastSync.get(guildId) ?? -Infinity) < STALE_AFTER_MS;
    const sync =
      this.pending.get(guildId) ?? (fresh ? null : this.start(guildId, false));
    if (sync) {
      const timeout = new AbortController();
      await Promise.race([
        sync.catch(() => undefined),
        sleep(DISPLAY_WAIT_MS, undefined, { signal: timeout.signal }).catch(
          () => undefined
        ),
      ]);
      timeout.abort();
    }
  }

  private start(guildId: string, full: boolean): Promise<SyncReport> {
    const pending = this.pending.get(guildId);
    if (pending && !full) {
      return pending;
    }

    this.lastSync.set(guildId, Date.now());
    const sync = this.exclusive(guildId, async () =>
      this.syncAccounts(await store.accounts(guildId), full)
    );
    this.pending.set(guildId, sync);
    void sync
      .catch(() => undefined)
      .then(() => {
        if (this.pending.get(guildId) === sync) {
          this.pending.delete(guildId);
        }
      });
    return sync;
  }

  private async syncAccounts(
    accounts: Account[],
    full: boolean
  ): Promise<SyncReport> {
    const report: SyncReport = {
      accounts: accounts.length,
      inserted: 0,
      updated: 0,
      failed: 0,
    };
    const remaining = [...accounts];
    const worker = async () => {
      for (
        let account = remaining.shift();
        account;
        account = remaining.shift()
      ) {
        try {
          const saved = await this.syncAccount(account, full);
          report.inserted += saved.inserted;
          report.updated += saved.updated;
        } catch (err) {
          report.failed += 1;
          logger.warn(
            err instanceof RngdleUserNotFoundError ? {} : { err },
            `Failed to sync RNGdle rolls | guildId = ${account.guildId} | username = ${account.username}`
          );
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(MAX_PARALLEL_FETCHES, accounts.length) },
        worker
      )
    );
    return report;
  }

  private async syncAccount(account: Account, full: boolean) {
    const latest = full
      ? null
      : await store.latestRollDate(account.guildId, account.userId);
    if (latest && latest >= startOfUtcDay(new Date())) {
      return { inserted: 0, updated: 0 };
    }
    return store.saveRolls(
      account,
      await fetchUserRolls(account.username, latest)
    );
  }
}

export default declareService(new RngdleSync());
