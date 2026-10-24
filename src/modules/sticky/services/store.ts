import prisma from "#lib/database.js";
import { RevisionCache, RevisionCounter } from "#lib/revision-cache.js";
import { declareService, type Service } from "#lib/service.js";

export interface Sticky {
  channelId: string;
  content: string;
  messageId: string | null;
}

const CACHE_TTL_MS = 5 * 60_000;

class StickyStore implements Service {
  private readonly cache = new RevisionCache(CACHE_TTL_MS);
  private readonly revisions = new RevisionCounter();

  private stickies(guildId: string): Promise<Map<string, Sticky>> {
    return this.cache.get(guildId, this.revisions.get(guildId), async () => {
      const rows = await prisma.stickyMessage.findMany({ where: { guildId } });
      return new Map(
        rows.map(({ channelId, content, messageId }) => [
          channelId,
          { channelId, content, messageId },
        ])
      );
    });
  }

  async get(guildId: string, channelId: string): Promise<Sticky | null> {
    const sticky = (await this.stickies(guildId)).get(channelId);
    return sticky ? { ...sticky } : null;
  }

  async list(guildId: string): Promise<Sticky[]> {
    return [...(await this.stickies(guildId)).values()].map((sticky) => ({
      ...sticky,
    }));
  }

  async set(
    guildId: string,
    channelId: string,
    content: string
  ): Promise<void> {
    await prisma.stickyMessage.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      create: { guildId, channelId, content },
      update: { content },
    });
    this.revisions.bump(guildId);
  }

  async setMessageId(
    guildId: string,
    channelId: string,
    messageId: string
  ): Promise<void> {
    await prisma.stickyMessage.updateMany({
      where: { guildId, channelId },
      data: { messageId },
    });
    const cached = (await this.stickies(guildId)).get(channelId);
    if (cached) {
      cached.messageId = messageId;
    }
  }

  async remove(guildId: string, ...channelIds: string[]): Promise<number> {
    const { count } = await prisma.stickyMessage.deleteMany({
      where: { guildId, channelId: { in: channelIds } },
    });
    this.revisions.bump(guildId);
    return count;
  }
}

export default declareService(new StickyStore());
