import { randomUUID } from "node:crypto";
import { declareService, type Service } from "#lib/service.js";
import type { LiveGame } from "../live/types.js";

const TTL_MS = 60 * 60 * 1000;

interface SnapshotEntry {
  game: LiveGame;
  expiresAt: number;
}

/**
 * A private board is a snapshot: its buttons browse the position it was opened
 * at instead of reading the watched game again on every click. Kept in memory,
 * never in the database, which only holds games still in progress.
 */
class LiveSnapshotStore implements Service {
  private readonly entries = new Map<string, SnapshotEntry>();

  create(game: LiveGame): LiveGame {
    this.prune();
    const snapshot = { ...game, id: randomUUID() };
    this.entries.set(snapshot.id, {
      game: snapshot,
      expiresAt: Date.now() + TTL_MS,
    });
    return { ...snapshot };
  }

  get(id: string): LiveGame | null {
    this.prune();
    const entry = this.entries.get(id);
    if (!entry) return null;
    entry.expiresAt = Date.now() + TTL_MS;
    return { ...entry.game };
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
  }
}

export default declareService(new LiveSnapshotStore());
