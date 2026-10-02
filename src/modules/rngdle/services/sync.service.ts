import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import { fetchUserRolls, RngdleUserNotFoundError } from "./rngdle-api.js";
import rngdleService, { type Account } from "./rngdle.service.js";

const logger = loggerMaker("rngdle");

const MAX_PARALLEL_FETCHES = 4;
const GUILD_COOLDOWN_MS = 5 * 60 * 1000;
const FULL_SYNC_COOLDOWN_MS = 15 * 60 * 1000;
const DISPLAY_SYNC_WAIT_MS = 10_000;

export interface SyncOptions {
  full?: boolean;
}

export interface SyncReport {
  accounts: number;
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
}

export class FullSyncCooldownError extends Error {
  constructor(readonly retryAt: Date) {
    super("A full sync ran recently on this guild");
  }
}

function emptyReport(): SyncReport {
  return { accounts: 0, fetched: 0, inserted: 0, updated: 0, failed: 0 };
}

function addReports(target: SyncReport, source: SyncReport): void {
  target.accounts += source.accounts;
  target.fetched += source.fetched;
  target.inserted += source.inserted;
  target.updated += source.updated;
  target.failed += source.failed;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

class SyncService implements Service {
  private readonly guildQueues = new Map<string, Promise<unknown>>();
  private readonly lastGuildSync = new Map<string, number>();
  private readonly lastFullSync = new Map<string, number>();
  private readonly pendingSyncs = new Map<string, Promise<SyncReport>>();

  runExclusive<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.guildQueues.get(guildId) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.catch(() => undefined);
    this.guildQueues.set(guildId, settled);
    void settled.then(() => {
      if (this.guildQueues.get(guildId) === settled) {
        this.guildQueues.delete(guildId);
      }
    });
    return next;
  }

  syncGuild(guildId: string, options: SyncOptions = {}): Promise<SyncReport> {
    if (options.full) {
      const last = this.lastFullSync.get(guildId);
      if (last !== undefined && Date.now() - last < FULL_SYNC_COOLDOWN_MS) {
        return Promise.reject(
          new FullSyncCooldownError(new Date(last + FULL_SYNC_COOLDOWN_MS))
        );
      }
      this.lastFullSync.set(guildId, Date.now());
    }
    return this.queueGuildSync(guildId, options);
  }

  async syncAll(options: SyncOptions = {}): Promise<SyncReport> {
    const { default: moduleService } =
      await import("#core/services/module.service.js");
    const guildIds = await moduleService.getActivatedGuildIds("rngdle");

    const report = emptyReport();
    for (const guildId of guildIds) {
      addReports(report, await this.queueGuildSync(guildId, options));
    }
    logger.info(
      `Sync done | guilds = ${guildIds.length} | accounts = ${report.accounts} | inserted = ${report.inserted} | updated = ${report.updated} | failed = ${report.failed}`
    );
    return report;
  }

  async syncGuildIfStale(guildId: string): Promise<void> {
    const last = this.lastGuildSync.get(guildId);
    const pending =
      this.pendingSyncs.get(guildId) ??
      (last !== undefined && Date.now() - last < GUILD_COOLDOWN_MS
        ? undefined
        : this.queueGuildSync(guildId, {}));
    if (!pending) {
      return;
    }

    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      pending.catch(() => undefined),
      new Promise((resolve) => {
        timeout = setTimeout(resolve, DISPLAY_SYNC_WAIT_MS);
      }),
    ]);
    clearTimeout(timeout);
  }

  private queueGuildSync(
    guildId: string,
    options: SyncOptions
  ): Promise<SyncReport> {
    const pending = this.pendingSyncs.get(guildId);
    if (pending && !options.full) {
      return pending;
    }

    this.lastGuildSync.set(guildId, Date.now());
    const sync = this.runExclusive(guildId, async () =>
      this.syncAccounts(await rngdleService.listAccounts(guildId), options)
    );
    this.pendingSyncs.set(guildId, sync);
    void sync
      .catch(() => undefined)
      .then(() => {
        if (this.pendingSyncs.get(guildId) === sync) {
          this.pendingSyncs.delete(guildId);
        }
      });
    return sync;
  }

  private async syncAccounts(
    accounts: Account[],
    options: SyncOptions
  ): Promise<SyncReport> {
    const report = emptyReport();
    report.accounts = accounts.length;

    const queue = [...accounts];
    const worker = async () => {
      for (let account = queue.shift(); account; account = queue.shift()) {
        const result = await this.syncAccount(account, options);
        addReports(report, { ...result, accounts: 0 });
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

  private async syncAccount(
    account: Account,
    { full = false }: SyncOptions
  ): Promise<Omit<SyncReport, "accounts">> {
    const result = { fetched: 0, inserted: 0, updated: 0, failed: 0 };
    try {
      const latest = full
        ? null
        : await rngdleService.latestRollDate(account.guildId, account.userId);
      if (latest && latest >= startOfUtcDay(new Date())) {
        return result;
      }

      const rolls = await fetchUserRolls(account.username, latest);
      result.fetched = rolls.length;
      const saved = await rngdleService.saveRolls(account, rolls);
      result.inserted = saved.inserted;
      result.updated = saved.updated;
    } catch (err) {
      result.failed = 1;
      if (err instanceof RngdleUserNotFoundError) {
        logger.warn(
          `RNGdle account not found | guildId = ${account.guildId} | userId = ${account.userId} | username = ${account.username}`
        );
      } else {
        logger.error(
          { err },
          `Failed to sync RNGdle rolls | guildId = ${account.guildId} | username = ${account.username}`
        );
      }
    }
    return result;
  }
}

export default declareService(new SyncService());
