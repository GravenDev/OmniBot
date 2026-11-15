import prisma from "#lib/database.js";

export async function lastDay(guildId: string): Promise<string | null> {
  const state = await prisma.seniorityState.findUnique({
    where: { guildId },
    select: { lastDay: true },
  });
  return state?.lastDay ?? null;
}

/** Marks `day` as announced: announcements run at most once a day. */
export async function claimDay(guildId: string, day: string): Promise<void> {
  await prisma.seniorityState.upsert({
    where: { guildId },
    create: { guildId, lastDay: day },
    update: { lastDay: day },
  });
}
