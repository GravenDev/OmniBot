import { declareService, type Service } from "#lib/service.js";
import rngdleService from "./rngdle.service.js";

const CACHE_TTL_MS = 15_000;

interface CachedValue {
  revision: number;
  expiresAt: number;
  value: Promise<unknown>;
}

class ImageCacheService implements Service {
  private readonly entries = new Map<string, CachedValue>();

  get<T>(guildId: string, key: string, render: () => Promise<T>): Promise<T> {
    const fullKey = `${guildId}:${key}`;
    const revision = rngdleService.getRevision(guildId);
    const cached = this.entries.get(fullKey);
    if (
      cached &&
      cached.revision === revision &&
      cached.expiresAt > Date.now()
    ) {
      return cached.value as Promise<T>;
    }

    for (const [entryKey, entry] of this.entries) {
      if (entry.expiresAt <= Date.now()) {
        this.entries.delete(entryKey);
      }
    }

    const value = render();
    const entry = { revision, expiresAt: Date.now() + CACHE_TTL_MS, value };
    this.entries.set(fullKey, entry);
    value.catch(() => {
      if (this.entries.get(fullKey) === entry) {
        this.entries.delete(fullKey);
      }
    });
    return value;
  }
}

export default declareService(new ImageCacheService());
