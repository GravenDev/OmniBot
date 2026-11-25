import { randomUUID } from "node:crypto";
import { declareService, type Service } from "#lib/service.js";
import type {
  ChessMode,
  ChessSession,
  ChessSide,
  GameAnalysis,
  GameSummary,
  ParsedGame,
} from "../types.js";
import { viewForMode } from "../types.js";

const SESSION_TTL_MS = 60 * 60 * 1000;

class SessionService implements Service {
  private readonly sessions = new Map<string, ChessSession>();

  create(
    ownerId: string,
    mode: ChessMode,
    side: ChessSide,
    games: GameSummary[],
    requestedPlayer?: string
  ): ChessSession {
    const session: ChessSession = {
      id: randomUUID(),
      ownerId,
      mode,
      view: viewForMode(mode),
      side,
      games,
      page: 1,
      ply: 0,
      flipped: false,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    if (requestedPlayer) session.requestedPlayer = requestedPlayer;
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): ChessSession | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
  }

  update(id: string, patch: Partial<ChessSession>): ChessSession | null {
    const session = this.get(id);
    if (!session) return null;
    Object.assign(session, patch);
    return session;
  }

  setParsed(id: string, parsed: ParsedGame): ChessSession | null {
    const session = this.get(id);
    if (!session) return null;
    Object.assign(session, {
      parsed,
      view: viewForMode(session.mode),
      ply: 0,
      flipped: false,
    });
    delete session.analysis;
    delete session.pendingAnalysis;
    return session;
  }

  setAnalysis(id: string, analysis: GameAnalysis): ChessSession | null {
    return this.update(id, { analysis });
  }

  sweep(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }
}

export default declareService(new SessionService());
