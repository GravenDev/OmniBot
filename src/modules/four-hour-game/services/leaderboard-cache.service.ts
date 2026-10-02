import { declareService, type Service } from "#lib/service.js";
import fourHourGameService from "./four-hour-game.service.js";

const CACHE_TTL_MS = 15_000;

interface CachedImage {
  revision: number;
  expiresAt: number;
  image: Promise<Buffer | null>;
}

class LeaderboardCacheService implements Service {
  private readonly entries = new Map<string, CachedImage>();

  get(
    guildId: string,
    locale: string,
    render: () => Promise<Buffer | null>
  ): Promise<Buffer | null> {
    const key = `${guildId}:${locale}`;
    const revision = fourHourGameService.getRevision(guildId);
    const cached = this.entries.get(key);
    if (
      cached &&
      cached.revision === revision &&
      cached.expiresAt > Date.now()
    ) {
      return cached.image;
    }

    const image = render();
    const entry = { revision, expiresAt: Date.now() + CACHE_TTL_MS, image };
    this.entries.set(key, entry);
    image.catch(() => {
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });
    return image;
  }
}

export default declareService(new LeaderboardCacheService());
