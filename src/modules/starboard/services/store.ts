import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";

export interface StarboardEntry {
  messageId: string;
  guildId: string;
  channelId: string;
  starboardChannelId: string;
  starboardMessageId: string | null;
}

class StarboardStore implements Service {
  find(messageId: string): Promise<StarboardEntry | null> {
    return prisma.starboardEntry.findUnique({ where: { messageId } });
  }

  findInvolving(messageId: string): Promise<StarboardEntry | null> {
    return prisma.starboardEntry.findFirst({
      where: { OR: [{ messageId }, { starboardMessageId: messageId }] },
    });
  }

  async create(entry: StarboardEntry): Promise<void> {
    await prisma.starboardEntry.create({ data: entry });
  }

  listForChannel(
    guildId: string,
    channelId: string
  ): Promise<StarboardEntry[]> {
    return prisma.starboardEntry.findMany({ where: { guildId, channelId } });
  }

  async dismiss(messageId: string, starboardMessageId: string): Promise<void> {
    await prisma.starboardEntry.updateMany({
      where: { messageId, starboardMessageId },
      data: { starboardMessageId: null },
    });
  }

  async remove(messageId: string): Promise<void> {
    await prisma.starboardEntry.deleteMany({ where: { messageId } });
  }

  async removeForChannel(guildId: string, channelId: string): Promise<void> {
    await prisma.starboardEntry.deleteMany({
      where: {
        guildId,
        OR: [{ channelId }, { starboardChannelId: channelId }],
      },
    });
  }
}

export default declareService(new StarboardStore());
