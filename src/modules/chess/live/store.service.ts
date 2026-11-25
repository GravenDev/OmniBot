import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";
import type { LiveGame, LiveSource } from "./types.js";

export interface NewLiveGame {
  id?: string;
  source: LiveSource;
  gameId: string;
  url: string;
  guildId: string;
  channelId: string;
  messageId: string;
  ownerId: string;
  white: string;
  black: string;
  timeControl: string;
  flipped: boolean;
  moves: string[];
  startFen?: string | undefined;
}

type Row =
  Awaited<ReturnType<typeof prisma.chessLiveGame.findUnique>> extends infer T
    ? NonNullable<T>
    : never;

function fromRow(row: Row): LiveGame {
  return {
    id: row.id,
    source: row.source as LiveSource,
    gameId: row.gameId,
    url: row.url,
    guildId: row.guildId,
    channelId: row.channelId,
    messageId: row.messageId,
    ownerId: row.ownerId,
    white: row.white,
    black: row.black,
    timeControl: row.timeControl,
    flipped: row.flipped,
    moves: row.moves.split(" ").filter(Boolean),
    startFen: row.startFen ?? undefined,
    ply: row.moves.split(" ").filter(Boolean).length,
    finished: row.finished,
    // Only ongoing watches are stored; a finished game's result is shown once
    // and its row is deleted, so no result survives a restart.
    result: "unknown",
  };
}

class LiveGameStore implements Service {
  /** One watch per public message: an edited reply never becomes a second one. */
  async watch(input: NewLiveGame): Promise<LiveGame> {
    // Callers pass a whole LiveGame: build the columns explicitly so view-only
    // fields such as `ply` never reach Prisma.
    const fields = {
      source: input.source,
      gameId: input.gameId,
      url: input.url,
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: input.messageId,
      ownerId: input.ownerId,
      white: input.white,
      black: input.black,
      timeControl: input.timeControl,
      flipped: input.flipped,
      moves: input.moves.join(" "),
      startFen: input.startFen ?? null,
    };
    const row = await prisma.chessLiveGame.upsert({
      where: {
        guildId_channelId_messageId: {
          guildId: input.guildId,
          channelId: input.channelId,
          messageId: input.messageId,
        },
      },
      create: { ...fields, ...(input.id ? { id: input.id } : {}) },
      update: { ...fields, finished: false },
    });
    return fromRow(row);
  }

  async get(id: string): Promise<LiveGame | null> {
    const row = await prisma.chessLiveGame.findUnique({ where: { id } });
    return row ? fromRow(row) : null;
  }

  async active(guildIds?: string[]): Promise<LiveGame[]> {
    const rows = await prisma.chessLiveGame.findMany({
      where: {
        finished: false,
        ...(guildIds ? { guildId: { in: guildIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(fromRow);
  }

  async setMoves(id: string, moves: string[]): Promise<void> {
    await prisma.chessLiveGame.update({
      where: { id },
      data: { moves: moves.join(" ") },
    });
  }

  /** A finished game leaves the database: it can no longer be resumed. */
  async unwatch(id: string): Promise<void> {
    await prisma.chessLiveGame.delete({ where: { id } });
  }
}

export default declareService(new LiveGameStore());
