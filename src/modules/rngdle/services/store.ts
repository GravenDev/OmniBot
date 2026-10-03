import { readFileSync } from "node:fs";
import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";
import type { RemoteRoll } from "./api.js";
import {
  isPlausibleTable,
  ScoreTable,
  type CompressedTable,
} from "./scoring.js";

const SNAPSHOT = new URL("../assets/score-table.json", import.meta.url);

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

export interface RollFilter {
  userId?: string;
  from?: Date;
  to?: Date;
  byScore?: boolean;
}

export type RegisterResult = "created" | "renamed" | "unchanged";

function loadTable(data: unknown): ScoreTable | null {
  const valid =
    typeof data === "object" &&
    data !== null &&
    Object.values(data).every((percent) => typeof percent === "number") &&
    isPlausibleTable(data as CompressedTable);
  return valid ? new ScoreTable(data as CompressedTable) : null;
}

class RngdleStore implements Service {
  private readonly revisions = new Map<string, number>();
  private table: Promise<ScoreTable> | null = null;

  revision(guildId: string): number {
    return this.revisions.get(guildId) ?? 0;
  }

  private touch(guildId: string): void {
    this.revisions.set(guildId, this.revision(guildId) + 1);
  }

  async register(
    guildId: string,
    userId: string,
    username: string
  ): Promise<RegisterResult> {
    const key = { guildId_userId: { guildId, userId } };
    const existing = await prisma.rngdleAccount.findUnique({ where: key });
    if (existing?.username === username) {
      return "unchanged";
    }

    await prisma.$transaction([
      prisma.rngdleRoll.deleteMany({ where: { guildId, userId } }),
      prisma.rngdleAccount.upsert({
        where: key,
        create: { guildId, userId, username },
        update: { username },
      }),
    ]);
    this.touch(guildId);
    return existing ? "renamed" : "created";
  }

  async unregister(guildId: string, userId: string): Promise<boolean> {
    const [, deleted] = await prisma.$transaction([
      prisma.rngdleRoll.deleteMany({ where: { guildId, userId } }),
      prisma.rngdleAccount.deleteMany({ where: { guildId, userId } }),
    ]);
    if (deleted.count > 0) {
      this.touch(guildId);
    }
    return deleted.count > 0;
  }

  accounts(guildId: string): Promise<Account[]> {
    return prisma.rngdleAccount.findMany({
      where: { guildId },
      orderBy: { username: "asc" },
    });
  }

  account(guildId: string, userId: string): Promise<Account | null> {
    return prisma.rngdleAccount.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  }

  accountByUsername(
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
    this.touch(guildId);
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
    { guildId, userId }: Account,
    rolls: RemoteRoll[]
  ): Promise<{ inserted: number; updated: number }> {
    if (rolls.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const known = new Map(
      (
        await prisma.rngdleRoll.findMany({
          where: { guildId, rollId: { in: rolls.map((roll) => roll.id) } },
          select: { rollId: true, score: true, badgeCount: true },
        })
      ).map((roll) => [roll.rollId, roll])
    );
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
      this.touch(guildId);
    }
    return { inserted: created.count, updated: changed.length };
  }

  async rolls(guildId: string, filter: RollFilter = {}): Promise<StoredRoll[]> {
    const rolls = await prisma.rngdleRoll.findMany({
      where: {
        guildId,
        ...(filter.userId && { userId: filter.userId }),
        ...((filter.from || filter.to) && {
          rolledAt: {
            ...(filter.from && { gte: filter.from }),
            ...(filter.to && { lt: filter.to }),
          },
        }),
      },
      orderBy: filter.byScore
        ? [{ score: "desc" }, { rolledAt: "asc" }]
        : { rolledAt: "asc" },
      select: {
        userId: true,
        number: true,
        score: true,
        badgeCount: true,
        rolledAt: true,
      },
    });
    return rolls.map((roll) => ({ ...roll, score: Number(roll.score) }));
  }

  async totals(guildId: string): Promise<{ userId: string; total: number }[]> {
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

  scoreTable(): Promise<ScoreTable> {
    if (!this.table) {
      this.table = prisma.rngdleScoreTable
        .findUnique({ where: { id: 1 } })
        .then(
          (stored) =>
            loadTable(stored?.data) ??
            new ScoreTable(JSON.parse(readFileSync(SNAPSHOT, "utf8")))
        );
      this.table.catch(() => {
        this.table = null;
      });
    }
    return this.table;
  }

  async replaceScoreTable(data: CompressedTable): Promise<boolean> {
    if ((await this.scoreTable()).equals(data)) {
      return false;
    }
    await prisma.rngdleScoreTable.upsert({
      where: { id: 1 },
      create: { id: 1, data },
      update: { data },
    });
    this.table = Promise.resolve(new ScoreTable(data));
    return true;
  }
}

export default declareService(new RngdleStore());
