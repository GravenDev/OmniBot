export const CHANNEL_NAME_MAX = 100;
export const USER_LIMIT_MAX = 99;

const RENAME_WINDOW_MS = 10 * 60_000;
const RENAMES_PER_WINDOW = 2;

export function renderName(
  template: string,
  member: { displayName: string; user: { username: string } }
): string {
  const name = template
    .replaceAll("{user}", member.displayName)
    .replaceAll("{username}", member.user.username)
    .trim();
  return (name || member.displayName).slice(0, CHANNEL_NAME_MAX);
}

export function cleanName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").trim();
  return name && name.length <= CHANNEL_NAME_MAX ? name : null;
}

export function parseUserLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,2}$/.test(trimmed)) {
    return null;
  }
  const limit = Number(trimmed);
  return limit <= USER_LIMIT_MAX ? limit : null;
}

export class RenameLimiter {
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
