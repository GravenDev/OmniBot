import type { Message } from "discord.js";
import logger from "#lib/logger.js";

/** Pacing window and cap — mirrors Discord's thread-creation rate limit. */
const RATE_LIMIT_WINDOW_MS = 10_000;
const MAX_THREADS_PER_WINDOW = 5;

/** A pending thread creation, captured when the source message arrived. */
export interface ThreadJob {
  message: Message;
  threadName: string;
  welcomeMessage: string | undefined;
}

/**
 * Per-guild FIFO queue that paces thread creation at {@link MAX_THREADS_PER_WINDOW}
 * per {@link RATE_LIMIT_WINDOW_MS}. When the window is full, jobs wait and resume
 * once it frees instead of being dropped (the previous behaviour).
 *
 * In-memory only: pending jobs are lost on restart, queues are per-guild (no
 * cross-guild sharing), and there is no size cap — see
 * `docs/specs/thread-creator-queue.md`.
 */
export class ThreadCreationQueue {
  private readonly queues = new Map<string, ThreadJob[]>();
  private readonly recentCreations = new Map<string, number[]>();
  private readonly draining = new Set<string>();

  /** Appends a job to the guild's queue and starts draining if not already running. */
  enqueue(guildId: string, job: ThreadJob): void {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.push(job);
    } else {
      this.queues.set(guildId, [job]);
    }

    if (!this.draining.has(guildId)) {
      this.draining.add(guildId);
      void this.pump(guildId);
    }
  }

  /**
   * Drains a guild's queue in order, pacing creations within the rate-limit
   * window. When the window is full it reschedules itself for when the oldest
   * creation ages out; `draining` stays set across the wait so a concurrent
   * `enqueue` never starts a second pump.
   */
  private async pump(guildId: string): Promise<void> {
    const queue = this.queues.get(guildId) ?? [];

    while (queue.length > 0) {
      const waitMs = this.msUntilSlotFree(guildId);
      if (waitMs > 0) {
        setTimeout(() => void this.pump(guildId), waitMs);
        return;
      }

      const job = queue.shift()!;
      this.recordCreation(guildId);
      await this.createThread(guildId, job);
    }

    this.draining.delete(guildId);
  }

  /** Milliseconds until a creation slot frees up (0 if one is available now). */
  private msUntilSlotFree(guildId: string): number {
    const now = Date.now();
    const recent = (this.recentCreations.get(guildId) ?? []).filter(
      (timestamp) => timestamp > now - RATE_LIMIT_WINDOW_MS
    );
    this.recentCreations.set(guildId, recent);

    if (recent.length < MAX_THREADS_PER_WINDOW) {
      return 0;
    }
    return recent[0]! + RATE_LIMIT_WINDOW_MS - now;
  }

  private recordCreation(guildId: string): void {
    const recent = this.recentCreations.get(guildId) ?? [];
    recent.push(Date.now());
    this.recentCreations.set(guildId, recent);
  }

  private async createThread(guildId: string, job: ThreadJob): Promise<void> {
    const { message, threadName, welcomeMessage } = job;
    try {
      const thread = await message.startThread({
        name: threadName,
        reason: "Création automatique de fil par ThreadCreator",
      });
      if (welcomeMessage) {
        await thread.send(welcomeMessage);
      }
      logger.info(`Fil créé avec succès : "${threadName}" (${guildId})`);
    } catch (error) {
      this.logCreationError(error, message, guildId);
    }
  }

  /** Logs Discord-specific failures at warn level, anything else at error level. */
  private logCreationError(
    error: unknown,
    message: Message,
    guildId: string
  ): void {
    if (error instanceof Error && "code" in error) {
      const code = (error as { code: number }).code;
      if (code === 160004) {
        logger.warn(
          `Impossible de créer un fil : le message a été supprimé (${guildId})`
        );
        return;
      }
      if (code === 160005) {
        logger.warn(
          `Limite de fils de discussion atteinte dans ${message.channel.id} (${guildId})`
        );
        return;
      }
      if (code === 50013) {
        logger.warn(
          `Permissions insuffisantes pour créer un fil dans ${message.channel.id} (${guildId})`
        );
        return;
      }
    }
    logger.error(
      `Erreur lors de la création du fil pour le message ${message.id} : ${error}`
    );
  }
}
