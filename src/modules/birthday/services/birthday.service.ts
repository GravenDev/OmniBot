import type { DayOfYear } from "#lib/calendar.js";
import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";
import type { Milestone } from "./paradox.js";

export interface BirthdayEntry extends DayOfYear {
  userId: string;
  announce: boolean;
}

export interface BirthdayState {
  lastDay: string | null;
  milestones: string[];
  firstCollisionCount: number | null;
}

const ENTRY = { userId: true, day: true, month: true, announce: true } as const;

class BirthdayService implements Service {
  async set(guildId: string, entry: BirthdayEntry): Promise<void> {
    const { userId, ...data } = entry;
    await prisma.birthday.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, ...data },
      update: data,
    });
  }

  async get(guildId: string, userId: string): Promise<BirthdayEntry | null> {
    return prisma.birthday.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: ENTRY,
    });
  }

  async remove(guildId: string, userId: string): Promise<boolean> {
    const { count } = await prisma.birthday.deleteMany({
      where: { guildId, userId },
    });
    return count > 0;
  }

  /** Deletes the birthdays of members who are no longer on the guild. */
  async removeMany(guildId: string, userIds: string[]): Promise<void> {
    await prisma.birthday.deleteMany({
      where: { guildId, userId: { in: userIds } },
    });
  }

  async list(guildId: string): Promise<BirthdayEntry[]> {
    return prisma.birthday.findMany({ where: { guildId }, select: ENTRY });
  }

  async count(guildId: string): Promise<number> {
    return prisma.birthday.count({ where: { guildId } });
  }

  /** Forgets everything the module stored for the guild. */
  async clearGuild(guildId: string): Promise<void> {
    await prisma.$transaction([
      prisma.birthday.deleteMany({ where: { guildId } }),
      prisma.birthdayState.deleteMany({ where: { guildId } }),
    ]);
  }

  async getState(guildId: string): Promise<BirthdayState> {
    const state = await prisma.birthdayState.findUnique({
      where: { guildId },
      select: { lastDay: true, milestones: true, firstCollisionCount: true },
    });
    return (
      state ?? { lastDay: null, milestones: [], firstCollisionCount: null }
    );
  }

  /**
   * Marks `day` as announced. False when it, or a later day, already was:
   * announcements run at most once a day, even if posting them fails halfway.
   */
  async claimDay(guildId: string, day: string): Promise<boolean> {
    const state = await this.getState(guildId);
    // Days compare as YYYY-MM-DD strings. A later or equal day already
    // announced means a time zone change moved the guild back a day.
    if (state.lastDay !== null && day <= state.lastDay) {
      return false;
    }
    await prisma.birthdayState.upsert({
      where: { guildId },
      create: { guildId, lastDay: day },
      update: { lastDay: day },
    });
    return true;
  }

  async recordMilestones(
    guildId: string,
    milestones: Milestone[],
    firstCollisionCount: number | null
  ): Promise<void> {
    const state = await this.getState(guildId);
    const data = {
      milestones: [...state.milestones, ...milestones],
      ...(firstCollisionCount !== null && { firstCollisionCount }),
    };
    await prisma.birthdayState.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
  }
}

export default declareService(new BirthdayService());
