import prisma from "#lib/database.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import { standingOf } from "./channel-history.js";
import {
  dayOf,
  previousDay,
  splitHold,
  startOfDay,
  type DayHold,
} from "./daily.js";
import { evaluateMessage, type MessageOutcome } from "./game-rules.js";
import { computeProfileStats, type ProfileStats } from "./profile.js";
import type {
  ChannelMessage,
  GameMessage,
  HistoryFetcher,
  LatestMessageFetcher,
} from "./types.js";

const logger = loggerMaker("four-hour-game");

export type MessageResult =
  | Exclude<MessageOutcome, { kind: "point" }>
  | (Extract<MessageOutcome, { kind: "point" }> & { score: number });

export type SetScoreResult = "created" | "updated" | "removed" | "absent";

export interface PlayerRank {
  rank: number;
  total: number;
}

export interface PlayerProfile extends ProfileStats {
  score: number;
  rank: number;
  total: number;
  dailyPoints: number;
  dailyRank: PlayerRank | null;
}

export interface DailyPoint {
  day: string;
  userId: string;
  heldSeconds: number;
}

export interface LeaderboardEntry {
  userId: string;
  score: number;
  rank: number;
}

class FourHourGameService implements Service {
  private readonly queue = new KeyedQueue();
  private readonly revisions = new Map<string, number>();

  getRevision(guildId: string): number {
    return this.revisions.get(guildId) ?? 0;
  }

  private bumpRevision(guildId: string): void {
    this.revisions.set(guildId, this.getRevision(guildId) + 1);
  }

  handleMessage(
    message: GameMessage,
    delaySeconds: number
  ): Promise<MessageResult> {
    return this.queue.run(message.guildId, () =>
      this.processMessage(message, delaySeconds)
    );
  }

  private async processMessage(
    { guildId, channelId, messageId, authorId, sentAt }: GameMessage,
    delaySeconds: number
  ): Promise<MessageResult> {
    const last = await prisma.fourHourGameLastMessage.findUnique({
      where: { guildId },
    });

    const outcome = evaluateMessage(
      last,
      { channelId, authorId, sentAt },
      delaySeconds
    );
    if (outcome.kind === "outdated" || outcome.kind === "sameAuthor") {
      return outcome;
    }

    const recordMessage = prisma.fourHourGameLastMessage.upsert({
      where: { guildId },
      create: { guildId, channelId, messageId, authorId, sentAt },
      update: { channelId, messageId, authorId, sentAt },
    });

    const held = outcome.kind === "first" ? null : last;

    if (outcome.kind !== "point") {
      await recordMessage;
      await this.recordDailyHold(guildId, held, sentAt);
      return outcome;
    }

    const [winner] = await prisma.$transaction([
      prisma.fourHourGameScore.upsert({
        where: { guildId_userId: { guildId, userId: outcome.winnerId } },
        create: { guildId, userId: outcome.winnerId, score: 1 },
        update: { score: { increment: 1 } },
      }),
      recordMessage,
      prisma.fourHourGamePoint.create({
        data: {
          guildId,
          userId: outcome.winnerId,
          heldSeconds: outcome.heldSeconds,
          awardedAt: sentAt,
        },
      }),
    ]);

    await this.recordDailyHold(guildId, held, sentAt);
    this.bumpRevision(guildId);
    return { ...outcome, score: winner.score };
  }

  private async getClosedDay(guildId: string, now: Date): Promise<string> {
    const state = await prisma.fourHourGameDailyState.findUnique({
      where: { guildId },
    });
    if (state) {
      return state.closedDay;
    }
    const closedDay = previousDay(dayOf(now));
    await prisma.fourHourGameDailyState.create({
      data: { guildId, closedDay },
    });
    return closedDay;
  }

  private async recordDailyHold(
    guildId: string,
    held: { authorId: string; sentAt: Date } | null,
    until: Date
  ): Promise<void> {
    try {
      const closedDay = await this.getClosedDay(guildId, until);
      if (held) {
        await this.creditHolds(
          guildId,
          held.authorId,
          splitHold(held.sentAt, until, closedDay)
        );
      }
    } catch (err) {
      logger.error(
        { err },
        `Failed to record the daily hold | guildId = ${guildId}`
      );
    }
  }

  private async creditHolds(
    guildId: string,
    userId: string,
    holds: readonly DayHold[]
  ): Promise<void> {
    for (const { day, seconds } of holds) {
      const best = await prisma.fourHourGameDailyBest.findUnique({
        where: { guildId_day: { guildId, day } },
      });
      if (best && best.heldSeconds >= seconds) {
        continue;
      }
      await prisma.fourHourGameDailyBest.upsert({
        where: { guildId_day: { guildId, day } },
        create: { guildId, day, userId, heldSeconds: seconds },
        update: { userId, heldSeconds: seconds },
      });
    }
  }

  closeDays(
    guildId: string,
    channelId: string | null,
    now: Date = new Date()
  ): Promise<DailyPoint[]> {
    return this.queue.run(guildId, async () => {
      const today = dayOf(now);
      const yesterday = previousDay(today);
      // A state created here is already closed up to yesterday.
      const closedDay = await this.getClosedDay(guildId, now);
      if (closedDay >= yesterday) {
        return [];
      }

      const live = await prisma.fourHourGameLastMessage.findUnique({
        where: { guildId },
      });
      if (live && live.channelId === channelId) {
        await this.creditHolds(
          guildId,
          live.authorId,
          splitHold(live.sentAt, startOfDay(today), closedDay)
        );
      }

      const [closed, { count }] = await prisma.$transaction([
        prisma.fourHourGameDailyBest.findMany({
          where: { guildId, day: { gt: closedDay, lte: yesterday } },
          select: { day: true, userId: true, heldSeconds: true },
          orderBy: { day: "asc" },
        }),
        prisma.fourHourGameDailyState.updateMany({
          where: { guildId, closedDay },
          data: { closedDay: yesterday },
        }),
      ]);
      if (count === 0) {
        return [];
      }
      if (closed.length > 0) {
        this.bumpRevision(guildId);
      }
      return closed;
    });
  }

  async getDailyStandings(
    guildId: string,
    upTo?: string
  ): Promise<LeaderboardEntry[]> {
    const state = await prisma.fourHourGameDailyState.findUnique({
      where: { guildId },
    });
    if (!state) {
      return [];
    }
    const lastDay =
      upTo !== undefined && upTo < state.closedDay ? upTo : state.closedDay;
    const groups = await prisma.fourHourGameDailyBest.groupBy({
      by: ["userId"],
      where: { guildId, day: { lte: lastDay } },
      _count: { _all: true },
    });
    return groups
      .map((group) => ({ userId: group.userId, score: group._count._all }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  async getDailyRank(
    guildId: string,
    userId: string,
    upTo?: string
  ): Promise<{ score: number; rank: PlayerRank | null }> {
    const standings = await this.getDailyStandings(guildId, upTo);
    const entry = standings.find((row) => row.userId === userId);
    return entry
      ? {
          score: entry.score,
          rank: { rank: entry.rank, total: standings.length },
        }
      : { score: 0, rank: null };
  }

  resetRound(guildId: string, now: Date = new Date()): Promise<void> {
    return this.queue.run(guildId, async () => {
      const state = await prisma.fourHourGameDailyState.findUnique({
        where: { guildId },
      });
      if (!state) {
        await prisma.fourHourGameLastMessage.deleteMany({ where: { guildId } });
        return;
      }
      await prisma.$transaction([
        prisma.fourHourGameLastMessage.deleteMany({ where: { guildId } }),
        prisma.fourHourGameDailyBest.deleteMany({
          where: { guildId, day: { gt: state.closedDay } },
        }),
        prisma.fourHourGameDailyState.update({
          where: { guildId },
          data: { closedDay: previousDay(dayOf(now)) },
        }),
      ]);
      this.bumpRevision(guildId);
    });
  }

  resyncLastMessage(
    guildId: string,
    channelId: string,
    fetchHistory: HistoryFetcher,
    now: Date = new Date()
  ): Promise<void> {
    return this.queue.run(guildId, async () => {
      const last = await prisma.fourHourGameLastMessage.findUnique({
        where: { guildId },
      });
      const history = await fetchHistory();
      if (!last || last.channelId !== channelId) {
        await this.storeLastMessage(guildId, channelId, standingOf(history));
        return;
      }

      const oldest = history[0];
      const deleted =
        !history.some((message) => message.messageId === last.messageId) &&
        (!oldest || oldest.sentAt <= last.sentAt);
      if (deleted) {
        await this.storeLastMessage(guildId, channelId, standingOf(history));
        return;
      }

      const holds: { authorId: string; from: Date; to: Date }[] = [];
      let current: ChannelMessage = last;
      for (const message of history) {
        if (
          message.sentAt > last.sentAt &&
          message.authorId !== current.authorId
        ) {
          holds.push({
            authorId: current.authorId,
            from: current.sentAt,
            to: message.sentAt,
          });
          current = message;
        }
      }
      if (holds.length === 0) {
        return;
      }

      const closedDay = await this.getClosedDay(guildId, now);
      for (const hold of holds) {
        await this.creditHolds(
          guildId,
          hold.authorId,
          splitHold(hold.from, hold.to, closedDay)
        );
      }
      await this.storeLastMessage(guildId, channelId, current);
    });
  }

  handleDeletion(
    guildId: string,
    channelId: string,
    messageIds: readonly string[],
    fetchLatest: LatestMessageFetcher
  ): Promise<boolean> {
    return this.queue.run(guildId, async () => {
      const last = await prisma.fourHourGameLastMessage.findUnique({
        where: { guildId },
      });
      if (
        !last ||
        last.channelId !== channelId ||
        !messageIds.includes(last.messageId)
      ) {
        return false;
      }
      await this.storeLastMessage(guildId, channelId, await fetchLatest());
      return true;
    });
  }

  private async storeLastMessage(
    guildId: string,
    channelId: string,
    latest: ChannelMessage | null
  ): Promise<void> {
    if (!latest) {
      await prisma.fourHourGameLastMessage.deleteMany({ where: { guildId } });
      return;
    }
    await prisma.fourHourGameLastMessage.upsert({
      where: { guildId },
      create: { guildId, channelId, ...latest },
      update: { channelId, ...latest },
    });
  }

  async getScore(guildId: string, userId: string): Promise<number | null> {
    const row = await prisma.fourHourGameScore.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    return row?.score ?? null;
  }

  async setScore(
    guildId: string,
    userId: string,
    score: number
  ): Promise<SetScoreResult> {
    if (score === 0) {
      return (await this.deleteScore(guildId, userId)) ? "removed" : "absent";
    }

    const existing = await this.getScore(guildId, userId);
    await prisma.fourHourGameScore.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, score },
      update: { score },
    });
    this.bumpRevision(guildId);
    return existing === null ? "created" : "updated";
  }

  deleteScore(guildId: string, userId: string): Promise<boolean> {
    return this.queue.run(guildId, async () => {
      const state = await prisma.fourHourGameDailyState.findUnique({
        where: { guildId },
      });
      const closedDay = state?.closedDay ?? "";
      const [{ count }, points, closed, open] = await prisma.$transaction([
        prisma.fourHourGameScore.deleteMany({ where: { guildId, userId } }),
        prisma.fourHourGamePoint.deleteMany({ where: { guildId, userId } }),
        prisma.fourHourGameDailyBest.deleteMany({
          where: { guildId, userId, day: { lte: closedDay } },
        }),
        prisma.fourHourGameDailyBest.deleteMany({
          where: { guildId, userId, day: { gt: closedDay } },
        }),
      ]);
      if (count > 0 || points.count > 0 || closed.count > 0 || open.count > 0) {
        this.bumpRevision(guildId);
      }
      return count > 0 || closed.count > 0;
    });
  }

  async getRank(guildId: string, userId: string): Promise<PlayerRank | null> {
    const score = await this.getScore(guildId, userId);
    if (score === null || score <= 0) {
      return null;
    }

    const [ahead, total] = await Promise.all([
      prisma.fourHourGameScore.count({
        where: {
          guildId,
          OR: [{ score: { gt: score } }, { score, userId: { lt: userId } }],
        },
      }),
      prisma.fourHourGameScore.count({
        where: { guildId, score: { gt: 0 } },
      }),
    ]);
    return { rank: ahead + 1, total };
  }

  async getProfile(
    guildId: string,
    userId: string,
    now: Date = new Date()
  ): Promise<PlayerProfile | null> {
    const [score, rank, daily, history] = await Promise.all([
      this.getScore(guildId, userId),
      this.getRank(guildId, userId),
      this.getDailyRank(guildId, userId),
      prisma.fourHourGamePoint.findMany({
        where: { guildId },
        select: { userId: true, heldSeconds: true, awardedAt: true },
        orderBy: [{ awardedAt: "asc" }, { id: "asc" }],
      }),
    ]);
    if (score === null && daily.score === 0) {
      return null;
    }
    const stats = computeProfileStats(history, userId, now);
    return {
      score: score ?? 0,
      rank: rank?.rank ?? 0,
      total: rank?.total ?? 0,
      ...stats,
      monthPoints: Math.min(stats.monthPoints, score ?? 0),
      dailyPoints: daily.score,
      dailyRank: daily.rank,
    };
  }

  async getLeaderboard(
    guildId: string,
    limit: number
  ): Promise<LeaderboardEntry[]> {
    const rows = await prisma.fourHourGameScore.findMany({
      where: { guildId, score: { gt: 0 } },
      orderBy: [{ score: "desc" }, { userId: "asc" }],
      take: limit,
    });
    return rows.map((row, index) => ({
      userId: row.userId,
      score: row.score,
      rank: index + 1,
    }));
  }
}

export default declareService(new FourHourGameService());
