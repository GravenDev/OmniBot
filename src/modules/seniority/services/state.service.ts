import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";

class StateService implements Service {
  async lastDay(guildId: string): Promise<string | null> {
    const state = await prisma.seniorityState.findUnique({
      where: { guildId },
      select: { lastDay: true },
    });
    return state?.lastDay ?? null;
  }

  /** Marks `day` as announced: announcements run at most once a day. */
  async claimDay(guildId: string, day: string): Promise<void> {
    await prisma.seniorityState.upsert({
      where: { guildId },
      create: { guildId, lastDay: day },
      update: { lastDay: day },
    });
  }
}

export default declareService(new StateService());
