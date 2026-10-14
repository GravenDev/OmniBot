import { AuditLogEvent, type Guild, PermissionFlagsBits } from "discord.js";
import { KeyedQueue } from "#lib/keyed-queue.js";

const FRESHNESS_MS = 10_000;
const AUDIT_DELAY_MS = 1_500;
const MAX_TRACKED_ENTRIES = 1_000;

export type DeleterLookup = (
  guild: Guild,
  authorId: string,
  channelId: string
) => Promise<string | null>;

export class DeleterFinder {
  private readonly queue = new KeyedQueue();
  private readonly counts = new Map<string, number>();

  constructor(
    private readonly options: { delayMs?: number; now?: () => number } = {}
  ) {}

  readonly find: DeleterLookup = async (guild, authorId, channelId) => {
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      return null;
    }
    return this.queue.run(guild.id, () =>
      this.lookup(guild, authorId, channelId)
    );
  };

  private async lookup(
    guild: Guild,
    authorId: string,
    channelId: string
  ): Promise<string | null> {
    const delayMs = this.options.delayMs ?? AUDIT_DELAY_MS;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const logs = await guild
      .fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 10 })
      .catch(() => null);
    const now = (this.options.now ?? Date.now)();
    const entry = logs?.entries.find((candidate) => {
      if (
        candidate.targetId !== authorId ||
        candidate.extra.channel.id !== channelId
      ) {
        return false;
      }
      const seen = this.counts.get(candidate.id);
      return seen === undefined
        ? now - candidate.createdTimestamp < FRESHNESS_MS
        : candidate.extra.count > seen;
    });
    if (!entry) {
      return null;
    }
    this.remember(entry.id, entry.extra.count);
    return entry.executorId;
  }

  private remember(entryId: string, count: number): void {
    this.counts.delete(entryId);
    this.counts.set(entryId, count);
    if (this.counts.size > MAX_TRACKED_ENTRIES) {
      const oldest = this.counts.keys().next().value;
      if (oldest !== undefined) {
        this.counts.delete(oldest);
      }
    }
  }
}

export const findDeleter = new DeleterFinder().find;
