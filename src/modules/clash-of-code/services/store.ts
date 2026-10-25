import prisma from "#lib/database.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { declareService, type Service } from "#lib/service.js";
import type { ClashMode, ClashReport } from "./api.js";

export const GameStatus = {
  Watching: "WATCHING",
  Imported: "IMPORTED",
  Abandoned: "ABANDONED",
} as const;

export interface WatchedGame {
  guildId: string;
  handle: string;
  channelId: string | null;
  messageId: string | null;
  watchUntil: Date;
}

export interface StoredPlayer {
  codingamerId: number;
  nickname: string;
  avatarId: bigint | null;
  userId: string | null;
}

export interface StoredParticipation {
  codingamerId: number;
  rank: number;
  score: number;
  durationMs: number;
}

export type WatchOutcome = "watching" | "known";

export type LinkOutcome =
  | { kind: "linked" | "unchanged" | "unknown" }
  | { kind: "conflict"; userId: string };

class ClashOfCodeStore implements Service {
  private readonly queue = new KeyedQueue();

  /** Serializes the writes of one guild, so concurrent links and imports never interleave. */
  exclusive<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    return this.queue.run(guildId, task);
  }

  /** Whether the guild already follows or recorded this game. */
  async isKnown(guildId: string, handle: string): Promise<boolean> {
    const game = await prisma.cocGame.findUnique({
      where: { guildId_handle: { guildId, handle } },
      select: { status: true },
    });
    return game !== null && game.status !== GameStatus.Abandoned;
  }

  watch(game: WatchedGame): Promise<WatchOutcome> {
    return this.exclusive(game.guildId, async () => {
      const key = {
        guildId_handle: { guildId: game.guildId, handle: game.handle },
      };
      const existing = await prisma.cocGame.findUnique({ where: key });
      if (existing && existing.status !== GameStatus.Abandoned) {
        return "known";
      }
      const data = {
        status: GameStatus.Watching,
        channelId: game.channelId,
        messageId: game.messageId,
        watchUntil: game.watchUntil,
      };
      await prisma.cocGame.upsert({
        where: key,
        create: { guildId: game.guildId, handle: game.handle, ...data },
        update: data,
      });
      return "watching";
    });
  }

  async watchedGames(guildIds: string[]): Promise<WatchedGame[]> {
    return prisma.cocGame.findMany({
      where: { guildId: { in: guildIds }, status: GameStatus.Watching },
      select: {
        guildId: true,
        handle: true,
        channelId: true,
        messageId: true,
        watchUntil: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Gives up on a game still being watched; returns false when it was settled meanwhile. */
  async abandon(guildId: string, handle: string): Promise<boolean> {
    const { count } = await prisma.cocGame.updateMany({
      where: { guildId, handle, status: GameStatus.Watching },
      data: { status: GameStatus.Abandoned },
    });
    return count > 0;
  }

  /**
   * Records a finished game. Returns false when the guild already had it, so
   * a game is announced once even if a watch and a manual import race.
   */
  importReport(
    guildId: string,
    report: ClashReport,
    origin: { channelId: string | null; messageId: string | null }
  ): Promise<boolean> {
    return this.exclusive(guildId, async () => {
      const key = { guildId_handle: { guildId, handle: report.handle } };
      const existing = await prisma.cocGame.findUnique({ where: key });
      if (existing?.status === GameStatus.Imported) {
        return false;
      }
      const game = {
        mode: report.mode,
        status: GameStatus.Imported,
        startedAt: report.startedAt,
      };
      await prisma.$transaction([
        ...report.players.map((player) =>
          prisma.cocPlayer.upsert({
            where: {
              guildId_codingamerId: {
                guildId,
                codingamerId: player.codingamerId,
              },
            },
            create: {
              guildId,
              codingamerId: player.codingamerId,
              nickname: player.nickname,
              avatarId: player.avatarId,
            },
            update: { nickname: player.nickname, avatarId: player.avatarId },
          })
        ),
        prisma.cocGame.upsert({
          where: key,
          create: {
            guildId,
            handle: report.handle,
            ...origin,
            watchUntil: new Date(),
            ...game,
          },
          update: game,
        }),
        prisma.cocParticipation.createMany({
          data: report.players.map((player) => ({
            guildId,
            handle: report.handle,
            codingamerId: player.codingamerId,
            rank: player.rank,
            score: player.score,
            durationMs: player.durationMs,
            criterion: player.criterion,
            language: player.language,
          })),
          skipDuplicates: true,
        }),
      ]);
      return true;
    });
  }

  async participations(
    guildId: string,
    mode: ClashMode | null = null
  ): Promise<StoredParticipation[]> {
    const games = await prisma.cocGame.findMany({
      where: {
        guildId,
        status: GameStatus.Imported,
        ...(mode && { mode }),
      },
      select: { handle: true },
    });
    if (games.length === 0) {
      return [];
    }
    return prisma.cocParticipation.findMany({
      where: { guildId, handle: { in: games.map((game) => game.handle) } },
      select: { codingamerId: true, rank: true, score: true, durationMs: true },
    });
  }

  async players(guildId: string): Promise<StoredPlayer[]> {
    return prisma.cocPlayer.findMany({
      where: { guildId },
      select: playerFields,
      orderBy: { nickname: "asc" },
    });
  }

  async playerByNickname(
    guildId: string,
    nickname: string
  ): Promise<StoredPlayer | null> {
    return prisma.cocPlayer.findFirst({
      where: { guildId, nickname: { equals: nickname, mode: "insensitive" } },
      select: playerFields,
    });
  }

  async playerByUser(
    guildId: string,
    userId: string
  ): Promise<StoredPlayer | null> {
    return prisma.cocPlayer.findFirst({
      where: { guildId, userId },
      select: playerFields,
    });
  }

  link(
    guildId: string,
    userId: string,
    codingamerId: number
  ): Promise<LinkOutcome> {
    return this.exclusive(guildId, async (): Promise<LinkOutcome> => {
      const target = await prisma.cocPlayer.findUnique({
        where: { guildId_codingamerId: { guildId, codingamerId } },
      });
      if (!target) {
        return { kind: "unknown" };
      }
      if (target.userId === userId) {
        return { kind: "unchanged" };
      }
      if (target.userId) {
        return { kind: "conflict", userId: target.userId };
      }
      await prisma.$transaction([
        prisma.cocPlayer.updateMany({
          where: { guildId, userId },
          data: { userId: null },
        }),
        prisma.cocPlayer.update({
          where: { guildId_codingamerId: { guildId, codingamerId } },
          data: { userId },
        }),
      ]);
      return { kind: "linked" };
    });
  }

  /** Returns the nickname that was linked, or null when the member had none. */
  unlink(guildId: string, userId: string): Promise<string | null> {
    return this.exclusive(guildId, async () => {
      const linked = await prisma.cocPlayer.findFirst({
        where: { guildId, userId },
      });
      if (!linked) {
        return null;
      }
      await prisma.cocPlayer.updateMany({
        where: { guildId, userId },
        data: { userId: null },
      });
      return linked.nickname;
    });
  }
}

const playerFields = {
  codingamerId: true,
  nickname: true,
  avatarId: true,
  userId: true,
} as const;

export default declareService(new ClashOfCodeStore());
