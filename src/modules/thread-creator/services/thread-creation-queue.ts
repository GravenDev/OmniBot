import { type Message, RESTJSONErrorCodes } from "discord.js";
import { apiErrorCode, isGuildSetupError } from "#lib/discord-errors.js";
import { LogThrottle } from "#lib/log-throttle.js";
import { loggerMaker } from "#lib/logger.js";

const logger = loggerMaker("thread-creator");
const warnings = new LogThrottle();

/** Pacing window and cap — mirrors Discord's thread-creation rate limit. */
const RATE_LIMIT_WINDOW_MS = 10_000;
const MAX_THREADS_PER_WINDOW = 5;

/** A pending thread creation, captured when the source message arrived. */
export interface ThreadJob {
  message: Message;
  threadName: string;
  welcomeMessage: string | undefined;
}

export interface CreationFailure {
  reason: string;
  level: "debug" | "throttled";
}

/**
 * Why Discord refused to start a thread under a message, from the code of its
 * error, when that is an expected outcome rather than a bug; null otherwise.
 */
export function creationFailure(
  code: number | undefined
): CreationFailure | null {
  switch (code) {
    // Deleted while waiting in the queue, by its author or a moderator.
    case RESTJSONErrorCodes.UnknownMessage:
      return { reason: "message deleted", level: "debug" };
    // The channel was deleted while its messages waited in the queue.
    case RESTJSONErrorCodes.UnknownChannel:
      return { reason: "channel deleted", level: "debug" };
    // Someone, or another bot, opened a thread first: nothing is lost.
    case RESTJSONErrorCodes.ThreadAlreadyCreatedForMessage:
      return { reason: "thread already exists", level: "debug" };
    case RESTJSONErrorCodes.MaximumActiveThreads:
      return { reason: "thread limit reached", level: "throttled" };
    case RESTJSONErrorCodes.MissingAccess:
    case RESTJSONErrorCodes.MissingPermissions:
      return { reason: "missing permissions", level: "throttled" };
    default:
      return null;
  }
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
        logger.debug(
          `Thread creation delayed | reason = rate limit window full | guildId = ${guildId} | waitMs = ${waitMs} | queued = ${queue.length}`
        );
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
    let thread;
    try {
      thread = await message.startThread({
        name: threadName,
        reason: "Création automatique de fil par ThreadCreator",
      });
    } catch (error) {
      this.logCreationError(error, message, guildId);
      return;
    }
    const context = `guildId = ${guildId} | channelId = ${message.channelId} | messageId = ${message.id} | threadId = ${thread.id}`;
    logger.info(`Thread created | ${context}`);
    if (!welcomeMessage) {
      return;
    }
    try {
      await thread.send(welcomeMessage);
    } catch (error) {
      // The thread exists: a refusal here is about posting in threads (or
      // the thread was deleted meanwhile), which fails until an admin acts,
      // hence the throttle. Anything else (a message Discord rejects, a
      // network failure) is an error.
      const code = apiErrorCode(error);
      const level = isGuildSetupError(error)
        ? warnings.level(`welcome:${message.channelId}`)
        : "error";
      logger[level](
        { err: error },
        `Thread created without its welcome message | ${code === undefined ? "" : `code = ${code} | `}${context}`
      );
    }
  }

  /** Logs an expected refusal from Discord in debug or as a throttled warning, anything else as an error. */
  private logCreationError(
    error: unknown,
    message: Message,
    guildId: string
  ): void {
    const context = `guildId = ${guildId} | channelId = ${message.channelId} | messageId = ${message.id}`;
    const code = apiErrorCode(error);
    const failure = creationFailure(code);
    if (!failure) {
      logger.error({ err: error }, `Thread creation failed | ${context}`);
      return;
    }
    // A full channel or a lost permission fails every message until an admin
    // acts: one warning an hour per channel and cause, the rest in debug.
    const level =
      failure.level === "throttled"
        ? warnings.level(`${failure.reason}:${message.channelId}`)
        : failure.level;
    logger[level](
      { err: error },
      `Thread not created | reason = ${failure.reason} | code = ${code} | ${context}`
    );
  }
}
