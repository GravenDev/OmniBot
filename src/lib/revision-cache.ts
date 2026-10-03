interface Entry {
  revision: number;
  expiresAt: number;
  value: Promise<unknown>;
}

export class RevisionCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly ttlMs: number) {}

  get<T>(key: string, revision: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.revision === revision && cached.expiresAt > now) {
      return cached.value as Promise<T>;
    }

    for (const [entryKey, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(entryKey);
      }
    }

    const value = load();
    const entry = { revision, expiresAt: now + this.ttlMs, value };
    this.entries.set(key, entry);
    value.catch(() => {
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });
    return value;
  }
}
