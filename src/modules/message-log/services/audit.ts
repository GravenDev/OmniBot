import { AuditLogEvent, type Guild, PermissionFlagsBits } from "discord.js";
import { KeyedQueue } from "#lib/keyed-queue.js";

const FRESHNESS_MS = 10_000;
const AUDIT_DELAY_MS = 1_500;
const MEMORY_MS = 5 * 60_000;
const MAX_TRACKED_ENTRIES = 1_000;

export type DeleterLookup = (
  guild: Guild,
  authorId: string,
  channelId: string
) => Promise<string | null>;

interface Seen {
  count: number;
  at: number;
}

export class DeleterFinder {
  private readonly queue = new KeyedQueue();
  private readonly seen = new Map<string, Seen>();

  constructor(
    private readonly options: { delayMs?: number; now?: () => number } = {}
  ) {}

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  readonly find: DeleterLookup = async (guild, authorId, channelId) => {
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      return null;
    }
    const receivedAt = this.now();
    return this.queue.run(guild.id, () =>
      this.lookup(guild, authorId, channelId, receivedAt)
    );
  };

  private async lookup(
    guild: Guild,
    authorId: string,
    channelId: string,
    receivedAt: number
  ): Promise<string | null> {
    const wait =
      receivedAt + (this.options.delayMs ?? AUDIT_DELAY_MS) - this.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    const logs = await guild
      .fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 10 })
      .catch(() => null);
    const now = this.now();
    for (const entry of logs?.entries.values() ?? []) {
      if (entry.targetId !== authorId || entry.extra.channel.id !== channelId) {
        continue;
      }
      const previous = this.recall(entry.id, now);
      if (previous === undefined) {
        const fresh =
          Math.abs(receivedAt - entry.createdTimestamp) < FRESHNESS_MS;
        this.remember(entry.id, fresh ? 1 : entry.extra.count, now);
        if (fresh) {
          return entry.executorId;
        }
      } else if (entry.extra.count > previous) {
        this.remember(entry.id, previous + 1, now);
        return entry.executorId;
      }
    }
    return null;
  }

  private recall(entryId: string, now: number): number | undefined {
    const seen = this.seen.get(entryId);
    return seen && now - seen.at < MEMORY_MS ? seen.count : undefined;
  }

  private remember(entryId: string, count: number, now: number): void {
    this.seen.delete(entryId);
    this.seen.set(entryId, { count, at: now });
    if (this.seen.size > MAX_TRACKED_ENTRIES) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) {
        this.seen.delete(oldest);
      }
    }
  }
}

export const findDeleter = new DeleterFinder().find;
