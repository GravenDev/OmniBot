import { declareService, type Service } from "#lib/service.js";

const RENAME_WINDOW_MS = 10 * 60_000;
const RENAMES_PER_WINDOW = 2;

/** Discord's limit on channel renames, two per ten minutes, kept per channel. */
export class RenameLimiter implements Service {
  private readonly renames = new Map<string, number[]>();

  private recent(channelId: string, now: number): number[] {
    const recent = (this.renames.get(channelId) ?? []).filter(
      (at) => at > now - RENAME_WINDOW_MS
    );
    if (recent.length > 0) {
      this.renames.set(channelId, recent);
    } else {
      this.renames.delete(channelId);
    }
    return recent;
  }

  retryAt(channelId: string, now = Date.now()): number | null {
    const recent = this.recent(channelId, now);
    return recent.length < RENAMES_PER_WINDOW
      ? null
      : recent[0]! + RENAME_WINDOW_MS;
  }

  record(channelId: string, now = Date.now()): void {
    this.renames.set(channelId, [...this.recent(channelId, now), now]);
  }

  release(channelId: string, at: number): void {
    const recent = (this.renames.get(channelId) ?? []).filter(
      (time) => time !== at
    );
    if (recent.length > 0) {
      this.renames.set(channelId, recent);
    } else {
      this.renames.delete(channelId);
    }
  }

  forget(channelId: string): void {
    this.renames.delete(channelId);
  }
}

export default declareService(new RenameLimiter());
