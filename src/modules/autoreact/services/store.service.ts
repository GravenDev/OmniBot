import prisma from "#lib/database.js";
import { RevisionCache, RevisionCounter } from "#lib/revision-cache.js";
import { declareService, type Service } from "#lib/service.js";

export interface AutoReaction {
  channelId: string;
  emoji: string;
}

const CACHE_TTL_MS = 5 * 60_000;

class AutoReactStore implements Service {
  private readonly cache = new RevisionCache(CACHE_TTL_MS);
  private readonly revisions = new RevisionCounter();

  private reactions(guildId: string): Promise<Map<string, string>> {
    return this.cache.get(guildId, this.revisions.get(guildId), async () => {
      const rows = await prisma.autoReaction.findMany({ where: { guildId } });
      return new Map(rows.map((row) => [row.channelId, row.emoji]));
    });
  }

  async emojiFor(guildId: string, channelId: string): Promise<string | null> {
    return (await this.reactions(guildId)).get(channelId) ?? null;
  }

  async list(guildId: string): Promise<AutoReaction[]> {
    return [...(await this.reactions(guildId))].map(([channelId, emoji]) => ({
      channelId,
      emoji,
    }));
  }

  async set(guildId: string, channelId: string, emoji: string): Promise<void> {
    await prisma.autoReaction.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      create: { guildId, channelId, emoji },
      update: { emoji },
    });
    this.revisions.bump(guildId);
  }

  async remove(guildId: string, ...channelIds: string[]): Promise<number> {
    const { count } = await prisma.autoReaction.deleteMany({
      where: { guildId, channelId: { in: channelIds } },
    });
    this.revisions.bump(guildId);
    return count;
  }
}

export default declareService(new AutoReactStore());
