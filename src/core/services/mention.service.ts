import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";

class MentionService implements Service {
  async setMentionable(
    guildId: string,
    userId: string,
    mentionable: boolean
  ): Promise<void> {
    if (mentionable) {
      await prisma.mentionOptOut.deleteMany({ where: { guildId, userId } });
      return;
    }
    await prisma.mentionOptOut.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId },
      update: {},
    });
  }

  async mentionable(guildId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }
    const optedOut = new Set(
      (
        await prisma.mentionOptOut.findMany({
          where: { guildId, userId: { in: userIds } },
          select: { userId: true },
        })
      ).map((row) => row.userId)
    );
    return userIds.filter((userId) => !optedOut.has(userId));
  }
}

export default declareService(new MentionService());
