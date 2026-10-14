import { AuditLogEvent, type Guild, PermissionFlagsBits } from "discord.js";

const FRESHNESS_MS = 10_000;
const AUDIT_DELAY_MS = 1_500;

export async function findDeleter(
  guild: Guild,
  authorId: string,
  channelId: string,
  options: { delayMs?: number; now?: () => number } = {}
): Promise<string | null> {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    return null;
  }
  const delayMs = options.delayMs ?? AUDIT_DELAY_MS;
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 })
    .catch(() => null);
  const now = (options.now ?? Date.now)();
  const entry = logs?.entries.find(
    (candidate) =>
      candidate.targetId === authorId &&
      candidate.extra.channel.id === channelId &&
      now - candidate.createdTimestamp < FRESHNESS_MS
  );
  return entry?.executorId ?? null;
}
