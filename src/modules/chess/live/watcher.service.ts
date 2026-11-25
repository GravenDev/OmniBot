import type { Client, Message } from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { presentGuilds } from "#lib/guild-loop.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";
import { declareService, type Service } from "#lib/service.js";
import { editable } from "../views.js";
import { pollInterval } from "./polling.js";
import { refreshGame } from "./sources.js";
import store from "./store.service.js";
import type { LiveGame } from "./types.js";
import { liveMessage } from "./views.js";

const logger = loggerMaker("chess");

const RETRY_DELAY_MS = 10_000;
const BACKOFF_CAP_MS = 5 * 60_000;
const MAX_BACKOFF_STEPS = 4;
const RESUME_SPACING_MS = 1_000;

function backoff(baseMs: number, failures: number): number {
  return Math.min(
    BACKOFF_CAP_MS,
    baseMs * 2 ** Math.min(failures - 1, MAX_BACKOFF_STEPS)
  );
}

class LiveWatcher implements Service {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly feedFailures = new Map<string, number>();
  private readonly editFailures = new Map<string, number>();
  private client: Client | null = null;
  private module: Module | null = null;

  attach(client: Client, module: Module): void {
    this.client = client;
    this.module = module;
  }

  /** Called once the public message exists and the watch is in the database. */
  track(game: LiveGame): void {
    this.schedule(game, pollInterval(game.timeControl));
  }

  /** Picks up stored watches after a restart or a missed timer. */
  async resume(): Promise<number> {
    if (!this.client || !this.module) return 0;
    const guildIds = presentGuilds(
      this.client,
      await moduleService.getActivatedGuildIds(this.module.id),
      { action: "resume the chess watches", logger }
    ).map((guild) => guild.id);
    const games = (await store.active(guildIds)).filter(
      (game) => !this.timers.has(game.id)
    );
    games.forEach((game, index) => {
      // A resumed watch starts fresh: a past outage must not keep its long
      // backoff after the bot restarts or the timer was missed.
      this.feedFailures.delete(game.id);
      this.editFailures.delete(game.id);
      this.schedule(game, index * RESUME_SPACING_MS);
    });
    return games.length;
  }

  stopAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.feedFailures.clear();
    this.editFailures.clear();
  }

  private schedule(game: LiveGame, delayMs: number): void {
    clearTimeout(this.timers.get(game.id));
    this.timers.set(
      game.id,
      setTimeout(() => {
        void this.poll(game).catch((err: unknown) =>
          logger.error({ err }, `Chess live poll failed | gameId = ${game.id}`)
        );
      }, delayMs)
    );
  }

  private async poll(game: LiveGame): Promise<void> {
    this.timers.delete(game.id);
    let snapshot;
    try {
      snapshot = await refreshGame(game);
    } catch (err) {
      const failures = (this.feedFailures.get(game.id) ?? 0) + 1;
      this.feedFailures.set(game.id, failures);
      logger.warn(
        { err },
        `Chess live feed unreachable | gameId = ${game.id} | failures = ${failures}`
      );
      // Keep polling with backoff: a temporary outage must not leave the board
      // frozen until the hourly resume task happens to pick the watch up.
      this.schedule(game, backoff(pollInterval(game.timeControl), failures));
      return;
    }
    this.feedFailures.delete(game.id);

    if (!snapshot) {
      this.schedule(game, pollInterval(game.timeControl));
      return;
    }
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
      try {
        if (!(await this.editMessage(updated))) {
          throw new Error("Chess watch message unavailable");
        }
        this.editFailures.delete(game.id);
        if (justFinished) {
          // The last move may have ended the game, but a resignation or a
          // timeout may not: show the result first, then forget the watch.
          try {
            await store.unwatch(game.id);
          } catch (err) {
            logger.error(
              { err },
              `Chess watch cleanup failed | gameId = ${game.id}`
            );
            this.schedule(game, RETRY_DELAY_MS);
          }
          return;
        }
        // Only a played move edits the public message while the game runs.
        // Persist it after the edit: on failure the old state stays in the DB
        // and the next poll retries instead of leaving a stale board forever.
        await store.setMoves(game.id, snapshot.moves);
      } catch (err) {
        const failures = (this.editFailures.get(game.id) ?? 0) + 1;
        this.editFailures.set(game.id, failures);
        logger.error(
          { err },
          `Chess watch update failed | gameId = ${game.id} | failures = ${failures}`
        );
        this.schedule(game, backoff(RETRY_DELAY_MS, failures));
        return;
      }
    }
    if (snapshot.finished) return;
    this.schedule(updated, pollInterval(updated.timeControl));
  }

  /** False when the public message cannot be fetched, so the edit can retry. */
  private async editMessage(game: LiveGame): Promise<boolean> {
    if (!this.client || !this.module) return false;
    const channel = await this.client.channels.fetch(game.channelId);
    if (!channel?.isTextBased() || !("messages" in channel)) {
      logger.warn(
        `Chess watch channel missing | channelId = ${game.channelId}`
      );
      return false;
    }
    const message: Message | null = await channel.messages
      .fetch(game.messageId)
      .catch(() => null);
    if (!message) {
      logger.warn(
        `Chess watch message missing | messageId = ${game.messageId}`
      );
      return false;
    }
    const config = await configService.getConfigForModuleIn(
      this.module,
      game.guildId
    );
    await message.edit(
      editable(await liveMessage(game, config.t, game.ply, false))
    );
    return true;
  }
}

export default declareService(new LiveWatcher());
