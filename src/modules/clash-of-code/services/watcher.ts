import {
  AttachmentBuilder,
  escapeMarkdown,
  type Client,
  type Message,
  type SendableChannels,
  MessageFlags,
} from "discord.js";
import configService from "#core/services/config.service.js";
import moduleService from "#core/services/module.service.js";
import { loggerMaker } from "#lib/logger.js";
import { NO_MENTIONS } from "#lib/mentions.js";
import type { Module } from "#lib/module.js";
import type { ClashOfCodeConfigSchema } from "#modules/clash-of-code/clash-of-code.config.js";
import {
  ClashNotFoundError,
  fetchClashReport,
  type ClashReport,
} from "./api.js";
import store, { type WatchedGame } from "./store.js";
import { modeLabel, resultImage } from "./views.js";

const logger = loggerMaker("clash-of-code");

export const WATCH_DURATION_MS = 2 * 60 * 60 * 1000;
export const POLL_INTERVAL_MS = 15_000;
export const LOBBY_INTERVAL_MS = 60_000;
export const MAX_FAILURES = 10;
export const MAX_CONCURRENT_FETCHES = 4;
const RESUME_SPACING_MS = 1_000;
const WATCHING_REACTION = "⏳";

type ClashModule = Module<ClashOfCodeConfigSchema>;

export type WatchResult = "watching" | "known" | "finished" | "unknown";

function keyOf(game: Pick<WatchedGame, "guildId" | "handle">): string {
  return `${game.guildId}:${game.handle}`;
}

class ClashWatcher {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly failures = new Map<string, number>();
  private readonly waiting: (() => void)[] = [];
  private fetching = 0;
  private client: Client | null = null;
  private module: ClashModule | null = null;

  attach(client: Client, module: ClashModule): void {
    this.client = client;
    this.module = module;
  }

  isWatching(game: Pick<WatchedGame, "guildId" | "handle">): boolean {
    return this.timers.has(keyOf(game));
  }

  /**
   * Starts following the clash linked in `message`. Only a game followed
   * before its end counts: a link to a game already over would let anyone
   * add any public game to the leaderboard, so it is ignored, and past games
   * go through /coc-admin import. When CodinGame cannot be reached, the game
   * is followed anyway and the polls retry.
   */
  async watch(message: Message<true>, handle: string): Promise<WatchResult> {
    if (await store.isKnown(message.guildId, handle)) {
      return "known";
    }
    let report: ClashReport | null = null;
    try {
      report = await this.limited(() => fetchClashReport(handle));
    } catch (err) {
      if (err instanceof ClashNotFoundError) {
        return "unknown";
      }
    }
    if (report?.finished) {
      return "finished";
    }

    const game: WatchedGame = {
      guildId: message.guildId,
      handle,
      channelId: message.channelId,
      messageId: message.id,
      watchUntil: new Date(Date.now() + WATCH_DURATION_MS),
    };
    if ((await store.watch(game)) === "known") {
      return "known";
    }
    await message.react(WATCHING_REACTION).catch(() => undefined);
    this.schedule(
      game,
      report && !report.started ? LOBBY_INTERVAL_MS : POLL_INTERVAL_MS
    );
    return "watching";
  }

  /** Picks up the games still watched, after a restart or a missed timer. */
  async resume(): Promise<number> {
    if (!this.module) {
      return 0;
    }
    const guildIds = await moduleService.getActivatedGuildIds(this.module.id);
    const games = (await store.watchedGames(guildIds)).filter(
      (game) => !this.isWatching(game)
    );
    games.forEach((game, index) =>
      this.schedule(game, index * RESUME_SPACING_MS)
    );
    return games.length;
  }

  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.failures.clear();
  }

  private schedule(game: WatchedGame, delayMs: number): void {
    const key = keyOf(game);
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        void this.poll(game).catch((err: unknown) =>
          logger.error(
            { err },
            `Clash poll failed | guildId = ${game.guildId} | handle = ${game.handle}`
          )
        );
      }, delayMs)
    );
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.fetching >= MAX_CONCURRENT_FETCHES) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.fetching++;
    try {
      return await task();
    } finally {
      this.fetching--;
      this.waiting.shift()?.();
    }
  }

  private async poll(game: WatchedGame): Promise<void> {
    const key = keyOf(game);
    this.timers.delete(key);
    const expired = Date.now() > game.watchUntil.getTime();

    let report: ClashReport;
    try {
      report = await this.limited(() => fetchClashReport(game.handle));
    } catch (err) {
      if (err instanceof ClashNotFoundError) {
        await this.abandon(game, "not found");
        return;
      }
      const failures = (this.failures.get(key) ?? 0) + 1;
      this.failures.set(key, failures);
      logger.warn(
        { err },
        `CodinGame unreachable | guildId = ${game.guildId} | handle = ${game.handle} | failures = ${failures}`
      );
      if (failures >= MAX_FAILURES || expired) {
        await this.abandon(game, "too many failures");
      } else {
        this.schedule(game, POLL_INTERVAL_MS);
      }
      return;
    }
    this.failures.delete(key);

    if (!report.finished) {
      if (expired) {
        await this.abandon(game, "still running");
      } else {
        this.schedule(
          game,
          report.started ? POLL_INTERVAL_MS : LOBBY_INTERVAL_MS
        );
      }
      return;
    }
    if (!report.started) {
      await this.abandon(game, "never started");
      return;
    }
    await this.finish(game, report);
  }

  private async isActive(guildId: string): Promise<boolean> {
    if (!this.module) {
      return false;
    }
    const state = await moduleService.getModuleStateFromGuildIdIn(
      this.module.id,
      guildId
    );
    return state.activated;
  }

  private async finish(game: WatchedGame, report: ClashReport): Promise<void> {
    if (!(await this.isActive(game.guildId))) {
      await this.abandon(game, "module disabled");
      return;
    }
    const imported = await store.importReport(game.guildId, report, {
      channelId: game.channelId,
      messageId: game.messageId,
    });
    await this.clearReaction(game);
    if (!imported) {
      return;
    }
    logger.info(
      `Clash imported | guildId = ${game.guildId} | handle = ${game.handle} | players = ${report.players.length}`
    );
    await this.publish(game, report).catch((err: unknown) =>
      logger.error(
        { err },
        `Could not post the clash result | guildId = ${game.guildId} | handle = ${game.handle}`
      )
    );
  }

  private async abandon(game: WatchedGame, reason: string): Promise<void> {
    this.failures.delete(keyOf(game));
    if (await store.abandon(game.guildId, game.handle)) {
      logger.info(
        `Clash abandoned | guildId = ${game.guildId} | handle = ${game.handle} | reason = ${reason}`
      );
    }
    await this.clearReaction(game);
  }

  private async channel(game: WatchedGame): Promise<SendableChannels | null> {
    if (!this.client || !game.channelId) {
      return null;
    }
    const channel = await this.client.channels
      .fetch(game.channelId)
      .catch(() => null);
    return channel?.isSendable() ? channel : null;
  }

  private async clearReaction(game: WatchedGame): Promise<void> {
    const channel = await this.channel(game);
    if (!channel || !game.messageId || !this.client?.user) {
      return;
    }
    const message = await channel.messages
      .fetch(game.messageId)
      .catch(() => null);
    await message?.reactions
      .resolve(WATCHING_REACTION)
      ?.users.remove(this.client.user.id)
      .catch(() => undefined);
  }

  private async publish(game: WatchedGame, report: ClashReport): Promise<void> {
    const channel = await this.channel(game);
    if (!channel || !this.client || !this.module) {
      return;
    }
    const config = await configService.getConfigForModuleIn(
      this.module,
      game.guildId
    );
    const winners = report.players
      .filter((player) => player.rank === 1)
      .map((player) => escapeMarkdown(player.nickname));
    const image = await resultImage(
      {
        client: this.client,
        guildId: game.guildId,
        t: config.t,
        locale: config.locale,
      },
      report
    );
    await channel.send({
      content: config.t("result.message", {
        mode: modeLabel(config.t, report.mode),
        count: report.players.length,
        winners: winners.join(", "),
      }),
      files: [new AttachmentBuilder(image, { name: "clash.png" })],
      allowedMentions: NO_MENTIONS,
      // An automatic announcement, like the other modules' scores: no push.
      flags: MessageFlags.SuppressNotifications,
      ...(game.messageId && {
        reply: { messageReference: game.messageId, failIfNotExists: false },
      }),
    });
  }
}

export default new ClashWatcher();
