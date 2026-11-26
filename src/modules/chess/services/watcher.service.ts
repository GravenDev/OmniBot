import { RESTJSONErrorCodes, type Client } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { isApiError } from "#lib/discord-errors.js";
import { presentGuilds } from "#lib/guild-loop.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareService, type Service } from "#lib/service.js";
import { pollInterval } from "../live/polling.js";
import { refreshGame } from "../live/sources.js";
import type { LiveGame } from "../live/types.js";
import { liveMessage } from "../live/views.js";
import { editable } from "../views.js";
import store from "./live-store.service.js";
import { RateLimitedError } from "./site-requests.service.js";

const logger = loggerMaker("chess");

const RETRY_DELAY_MS = 10_000;
const BACKOFF_CAP_MS = 5 * 60_000;
const MAX_BACKOFF_STEPS = 4;
const RESUME_SPACING_MS = 1_000;

/** The public message can no longer be shown: the watch has nothing to edit. */
const GONE = [
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.MissingAccess,
  // The board is an attachment: without Attach Files it cannot be redrawn.
  RESTJSONErrorCodes.MissingPermissions,
  RESTJSONErrorCodes.InvalidActionOnArchivedThread,
] as const;

/**
 * A watch whose feed or message keeps failing for this long is given up: a
 * game deleted from the site, a feed changed for good, a message the bot can
 * no longer edit. A rate limit is the bot's own doing and never counts.
 */
const GIVE_UP_AFTER_MS = 2 * 60 * 60_000;
/** Two failures hours apart are no outage: the run must also be this long. */
const GIVE_UP_AFTER_FAILURES = 10;

function longEnough(failures: { count: number; since: number }): boolean {
  return (
    failures.count >= GIVE_UP_AFTER_FAILURES &&
    Date.now() - failures.since >= GIVE_UP_AFTER_MS
  );
}

type EditOutcome = "edited" | "gone" | "stopped";
type Snapshot = NonNullable<Awaited<ReturnType<typeof refreshGame>>>;

function backoff(baseMs: number, failures: number): number {
  return Math.min(
    BACKOFF_CAP_MS,
    baseMs * 2 ** Math.min(failures - 1, MAX_BACKOFF_STEPS)
  );
}

interface Failures {
  count: number;
  since: number;
}

class LiveWatcher implements Service {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /**
   * The watches this watcher runs. A poll waiting on the feed has no timer:
   * `forget` drops the id from here, so that poll ends instead of editing the
   * message and re-arming a watch someone stopped.
   */
  private readonly tracked = new Set<string>();
  private readonly polling = new Set<string>();
  /** Ids forgotten while `resume` reads the stored watches. */
  private readonly forgottenDuringResume = new Set<string>();
  private resuming = 0;
  private readonly feedFailures = new Map<string, Failures>();
  private readonly editFailures = new Map<string, Failures>();
  private client: Client | null = null;
  private module: Module | null = null;

  attach(client: Client, module: Module): void {
    this.client = client;
    this.module = module;
  }

  /** Called once the public message exists and the watch is in the database. */
  track(game: LiveGame): void {
    this.tracked.add(game.id);
    this.schedule(game, pollInterval(game.timeControl, game.source));
  }

  /** Picks up stored watches after a restart or a missed timer. */
  async resume(): Promise<number> {
    if (!this.client || !this.module) return 0;
    this.resuming++;
    try {
      const guildIds = presentGuilds(
        this.client,
        await moduleService.getActivatedGuildIds(this.module.id),
        { action: "resume the chess watches", logger }
      ).map((guild) => guild.id);
      const games = (await store.active(guildIds)).filter(
        // A watch already waiting, or polling right now, is running already;
        // one stopped while the rows were read must stay stopped.
        (game) =>
          !this.timers.has(game.id) &&
          !this.polling.has(game.id) &&
          !this.forgottenDuringResume.has(game.id)
      );
      games.forEach((game, index) => {
        // A resumed watch starts fresh: a past outage must not keep its long
        // backoff after the bot restarts or the timer was missed.
        this.feedFailures.delete(game.id);
        this.editFailures.delete(game.id);
        this.tracked.add(game.id);
        this.schedule(game, index * RESUME_SPACING_MS);
      });
      return games.length;
    } finally {
      if (--this.resuming === 0) this.forgottenDuringResume.clear();
    }
  }

  stopAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.tracked.clear();
    this.feedFailures.clear();
    this.editFailures.clear();
  }

  private schedule(game: LiveGame, delayMs: number): void {
    clearTimeout(this.timers.get(game.id));
    if (!this.tracked.has(game.id)) return;
    this.timers.set(
      game.id,
      setTimeout(() => {
        this.polling.add(game.id);
        void this.poll(game)
          .catch((err: unknown) =>
            logger.error(
              { err },
              `Chess live poll failed | gameId = ${game.id}`
            )
          )
          .finally(() => this.polling.delete(game.id));
      }, delayMs)
    );
  }

  /** Counts one more failure and returns the run: how many, since when. */
  private failed(failures: Map<string, Failures>, id: string): Failures {
    const current = failures.get(id) ?? { count: 0, since: Date.now() };
    const next = { count: current.count + 1, since: current.since };
    failures.set(id, next);
    return next;
  }

  private async poll(game: LiveGame): Promise<void> {
    this.timers.delete(game.id);
    const interval = pollInterval(game.timeControl, game.source);
    let snapshot: Snapshot | null = null;
    let failure: unknown;
    try {
      snapshot = await refreshGame(game);
      if (!snapshot) failure = new Error("The feed does not show the game");
    } catch (err) {
      failure = err;
    }
    // Stopped while the feed answered: nothing to show, nothing to re-arm.
    if (!this.tracked.has(game.id)) return;

    if (failure instanceof RateLimitedError) {
      // The site asked the bot to slow down: wait as long as it said.
      this.schedule(game, Math.max(interval, failure.retryAfterMs));
      return;
    }
    if (!snapshot) {
      await this.feedFailed(game, interval, failure);
      return;
    }
    this.feedFailures.delete(game.id);
    await this.show(game, snapshot, interval);
  }

  private async feedFailed(
    game: LiveGame,
    interval: number,
    failure: unknown
  ): Promise<void> {
    const failures = this.failed(this.feedFailures, game.id);
    logger.warn(
      { err: failure },
      `Chess live feed unreachable | gameId = ${game.id} | failures = ${failures.count}`
    );
    if (longEnough(failures)) {
      await this.stop(game, "feed unavailable", true);
      return;
    }
    // Keep polling with backoff: a temporary outage must not leave the board
    // frozen until the hourly resume task happens to pick the watch up.
    this.schedule(game, backoff(interval, failures.count));
  }

  /** Redraws the message when the feed moved on, then polls again. */
  private async show(
    game: LiveGame,
    snapshot: Snapshot,
    interval: number
  ): Promise<void> {
    const changed = snapshot.moves.join(" ") !== game.moves.join(" ");
    const justFinished = snapshot.finished && !game.finished;
    const updated: LiveGame = {
      ...game,
      moves: snapshot.moves,
      ply: snapshot.moves.length,
      finished: snapshot.finished,
      result: snapshot.result,
    };

    if (changed || justFinished) {
      if (!(await this.update(game, updated, interval, justFinished))) return;
    }
    if (snapshot.finished) return;
    // The message shows `updated` now, saved or not: going on from it keeps a
    // failed save from redrawing the same board at every poll.
    this.schedule(updated, interval);
  }

  /** Edits the message to `updated`; false when the watch must not go on. */
  private async update(
    game: LiveGame,
    updated: LiveGame,
    interval: number,
    justFinished: boolean
  ): Promise<boolean> {
    let outcome: EditOutcome;
    try {
      outcome = await this.editMessage(updated);
    } catch (err) {
      await this.editFailed(game, interval, err);
      return false;
    }
    if (outcome === "stopped") return false;
    if (outcome === "gone") {
      // Deleted message or channel, or the bot lost access: retrying
      // would poll the feed for ever with nothing left to show it on.
      await this.stop(game, "message gone");
      return false;
    }
    this.editFailures.delete(game.id);
    if (justFinished) {
      // The last move may have ended the game, but a resignation or a
      // timeout may not: show the result first, then forget the watch.
      await this.stop(game, "game finished");
      return false;
    }
    return this.saveMoves(updated);
  }

  private async editFailed(
    game: LiveGame,
    interval: number,
    err: unknown
  ): Promise<void> {
    const failures = this.failed(this.editFailures, game.id);
    logger.error(
      { err },
      `Chess watch update failed | gameId = ${game.id} | failures = ${failures.count}`
    );
    if (longEnough(failures)) {
      await this.stop(game, "message cannot be edited");
      return;
    }
    // Never sooner than the feed's own interval (15 s for Chess.com).
    this.schedule(
      game,
      Math.max(interval, backoff(RETRY_DELAY_MS, failures.count))
    );
  }

  /**
   * Saves the moves the message now shows, so that a restart resumes from
   * them. False when the watch was stopped meanwhile; a failed save is only
   * logged, as the next move saves the whole list again.
   */
  private async saveMoves(game: LiveGame): Promise<boolean> {
    try {
      if (await store.setMoves(game.id, game.moves)) return true;
      this.forget(game.id);
      return false;
    } catch (err) {
      logger.error(
        { err },
        `Chess watch moves not saved | gameId = ${game.id}`
      );
      return true;
    }
  }

  /**
   * Removes the watch and forgets its timers; a failure is retried. `show`
   * marks the message as stopped first, for a watch given up while its
   * message still looks live.
   */
  private async stop(
    game: LiveGame,
    reason: string,
    show = false
  ): Promise<void> {
    if (show) {
      await this.editMessage(game, true).catch((err: unknown) =>
        logger.warn(
          { err },
          `Chess watch not marked stopped | gameId = ${game.id}`
        )
      );
    }
    try {
      await store.unwatch(game.id);
    } catch (err) {
      logger.error({ err }, `Chess watch cleanup failed | gameId = ${game.id}`);
      this.schedule(
        game,
        Math.max(RETRY_DELAY_MS, pollInterval(game.timeControl, game.source))
      );
      return;
    }
    this.forget(game.id);
    logger.info(
      `Chess watch stopped | gameId = ${game.id} | reason = ${reason}`
    );
  }

  /** Cancels a watch's timer, for one removed outside the poll loop. */
  forget(id: string): void {
    this.tracked.delete(id);
    if (this.resuming > 0) this.forgottenDuringResume.add(id);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.feedFailures.delete(id);
    this.editFailures.delete(id);
  }

  /**
   * "gone" when the public message can never be edited again, "stopped" when
   * the watch was stopped while its board was drawn; any other failure
   * throws, so that the edit is retried with a backoff.
   */
  private async editMessage(
    game: LiveGame,
    stopped = false
  ): Promise<EditOutcome> {
    if (!this.client || !this.module) throw new Error("Watcher not attached");
    try {
      const channel = await this.client.channels.fetch(game.channelId);
      if (!channel?.isTextBased() || !("messages" in channel)) return "gone";
      const message = await channel.messages.fetch(game.messageId);
      const config = await configService.getConfigForModuleIn(
        this.module,
        game.guildId
      );
      const board = editable(
        await liveMessage(game, config.t, game.ply, false, stopped)
      );
      // The Stop button may have shown "stopped" while this board was drawn.
      if (!stopped && !this.tracked.has(game.id)) return "stopped";
      await message.edit(board);
      return "edited";
    } catch (err) {
      if (isApiError(err, ...GONE)) return "gone";
      throw err;
    }
  }
}

export default declareService(new LiveWatcher());
