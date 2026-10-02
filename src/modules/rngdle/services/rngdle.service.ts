import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";
import type { RemoteRoll } from "./rngdle-api.js";

export interface Account {
  guildId: string;
  userId: string;
  username: string;
}

export interface StoredRoll {
  userId: string;
  number: number;
  score: number;
  badgeCount: number;
  rolledAt: Date;
}

export interface UserTotal {
  userId: string;
  total: number;
}

export type RegisterResult = "created" | "renamed" | "unchanged";

const rollFields = {
  userId: true,
  number: true,
  score: true,
  badgeCount: true,
  rolledAt: true,
} as const;

function toStoredRoll(roll: {
  userId: string;
  number: number;
  score: bigint;
  badgeCount: number;
  rolledAt: Date;
}): StoredRoll {
  return { ...roll, score: Number(roll.score) };
}

class RngdleService implements Service {
  private readonly revisions = new Map<string, number>();

  getRevision(guildId: string): number {
    return this.revisions.get(guildId) ?? 0;
  }

  private bumpRevision(guildId: string): void {
    this.revisions.set(guildId, this.getRevision(guildId) + 1);
  }

  async register(
    guildId: string,
    userId: string,
    username: string
  ): Promise<RegisterResult> {
    const existing = await prisma.rngdleAccount.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (existing?.username === username) {
      return "unchanged";
    }

    await prisma.$transaction([
      prisma.rngdleRoll.deleteMany({ where: { guildId, userId } }),
      prisma.rngdleAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, username },
        update: { username },
      }),
    ]);
    this.bumpRevision(guildId);
    return existing ? "renamed" : "created";
  }

  async unregister(guildId: string, userId: string): Promise<boolean> {
    const [, deleted] = await prisma.$transaction([
      prisma.rngdleRoll.deleteMany({ where: { guildId, userId } }),
      prisma.rngdleAccount.deleteMany({ where: { guildId, userId } }),
    ]);
    if (deleted.count === 0) {
      return false;
    }
    this.bumpRevision(guildId);
    return true;
  }

  listAccounts(guildId: string): Promise<Account[]> {
    return prisma.rngdleAccount.findMany({
      where: { guildId },
      orderBy: { username: "asc" },
    });
  }

  listAllAccounts(): Promise<Account[]> {
    return prisma.rngdleAccount.findMany();
  }

  getAccount(guildId: string, userId: string): Promise<Account | null> {
    return prisma.rngdleAccount.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  }

  findAccountByUsername(
    guildId: string,
    username: string
  ): Promise<Account | null> {
    return prisma.rngdleAccount.findFirst({
      where: { guildId, username: { equals: username, mode: "insensitive" } },
    });
  }

  async clearRolls(guildId: string): Promise<number> {
    const { count } = await prisma.rngdleRoll.deleteMany({
      where: { guildId },
    });
    this.bumpRevision(guildId);
    return count;
  }

  async latestRollDate(guildId: string, userId: string): Promise<Date | null> {
    const latest = await prisma.rngdleRoll.findFirst({
      where: { guildId, userId },
      orderBy: { rolledAt: "desc" },
      select: { rolledAt: true },
    });
    return latest?.rolledAt ?? null;
  }

  async saveRolls(
    account: Account,
    rolls: RemoteRoll[]
  ): Promise<{ inserted: number; updated: number }> {
    const { guildId, userId } = account;
    if (rolls.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const existing = await prisma.rngdleRoll.findMany({
      where: { guildId, rollId: { in: rolls.map((roll) => roll.id) } },
      select: { rollId: true, score: true, badgeCount: true },
    });
    const known = new Map(existing.map((roll) => [roll.rollId, roll]));

    const fresh = rolls.filter((roll) => !known.has(roll.id));
    const changed = rolls.filter((roll) => {
      const stored = known.get(roll.id);
      return (
        stored !== undefined &&
        (stored.score !== BigInt(roll.score) ||
          stored.badgeCount !== roll.badgeCount)
      );
    });

    const [created] = await prisma.$transaction([
      prisma.rngdleRoll.createMany({
        data: fresh.map((roll) => ({
          guildId,
          userId,
          rollId: roll.id,
          number: roll.number,
          score: BigInt(roll.score),
          badgeCount: roll.badgeCount,
          rolledAt: roll.rolledAt,
        })),
        skipDuplicates: true,
      }),
      ...changed.map((roll) =>
        prisma.rngdleRoll.update({
          where: { guildId_rollId: { guildId, rollId: roll.id } },
          data: { score: BigInt(roll.score), badgeCount: roll.badgeCount },
        })
      ),
    ]);

    if (created.count > 0 || changed.length > 0) {
      this.bumpRevision(guildId);
    }
    return { inserted: created.count, updated: changed.length };
  }

  async rollsBetween(
    guildId: string,
    from: Date,
    to: Date
  ): Promise<StoredRoll[]> {
    const rolls = await prisma.rngdleRoll.findMany({
      where: { guildId, rolledAt: { gte: from, lt: to } },
      orderBy: [{ score: "desc" }, { rolledAt: "asc" }],
      select: rollFields,
    });
    return rolls.map(toStoredRoll);
  }

  async userRolls(guildId: string, userId: string): Promise<StoredRoll[]> {
    const rolls = await prisma.rngdleRoll.findMany({
      where: { guildId, userId },
      orderBy: { rolledAt: "asc" },
      select: rollFields,
    });
    return rolls.map(toStoredRoll);
  }

  async guildRolls(guildId: string): Promise<StoredRoll[]> {
    const rolls = await prisma.rngdleRoll.findMany({
      where: { guildId },
      orderBy: { rolledAt: "asc" },
      select: rollFields,
    });
    return rolls.map(toStoredRoll);
  }

  async totalsByUser(guildId: string): Promise<UserTotal[]> {
    const groups = await prisma.rngdleRoll.groupBy({
      by: ["userId"],
      where: { guildId },
      _sum: { score: true },
    });
    return groups
      .map((group) => ({
        userId: group.userId,
        total: Number(group._sum.score ?? 0n),
      }))
      .sort((a, b) => b.total - a.total || a.userId.localeCompare(b.userId));
  }
}

export default declareService(new RngdleService());
