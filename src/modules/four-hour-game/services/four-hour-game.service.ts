import prisma, { type Prisma } from "#lib/database.js";
import { KeyedQueue } from "#lib/keyed-queue.js";
import { loggerMaker } from "#lib/logger.js";
import { RevisionCounter } from "#lib/revision-cache.js";
import { declareService, type Service } from "#lib/service.js";
import { standingOf } from "./channel-history.js";
import {
  dayOf,
  nextDay,
  previousDay,
  splitHold,
  startOfDay,
  type DayHold,
} from "./daily.js";
import {
  evaluateMessage,
  type MessageOutcome,
  replayMessages,
} from "./game-rules.js";
import { computeProfileStats, type ProfileStats } from "./profile.js";
import type {
  ChannelMessage,
  GameMessage,
  HistoryReader,
  LatestMessageFetcher,
  RoundSync,
} from "./types.js";

const logger = loggerMaker("four-hour-game");

// The write of the last message, or its removal when none is left. Without
// `scoringFrom`, a message already in place keeps its own (it replaced one
// without scoring, or is back after a deletion); a new one starts at its time.
function lastMessageWrite(
  guildId: string,
  channelId: string,
  latest: ChannelMessage | null,
  scoringFrom?: Date,
  db: Prisma.TransactionClient = prisma
) {
  return latest
    ? db.fourHourGameLastMessage.upsert({
        where: { guildId },
        create: {
          guildId,
          channelId,
          ...latest,
          scoringFrom: scoringFrom ?? latest.sentAt,
        },
        update: { channelId, ...latest, ...(scoringFrom && { scoringFrom }) },
      })
    : db.fourHourGameLastMessage.deleteMany({ where: { guildId } });
}

// The writes of a 4h point: the winner's score, and the point itself.
function pointWrites(
  guildId: string,
  winnerId: string,
  heldSeconds: number,
  awardedAt: Date,
  db: Prisma.TransactionClient = prisma
) {
  return [
    db.fourHourGameScore.upsert({
      where: { guildId_userId: { guildId, userId: winnerId } },
      create: { guildId, userId: winnerId, score: 1 },
      update: { score: { increment: 1 } },
    }),
    db.fourHourGamePoint.create({
      data: { guildId, userId: winnerId, heldSeconds, awardedAt },
    }),
  ] as const;
}

export type MessageResult =
  | Exclude<MessageOutcome, { kind: "point" }>
  | (Extract<MessageOutcome, { kind: "point" }> & { score: number });

export type SetScoreResult = "created" | "updated";

/** A 4h point, with its winner's new score: for its announcement. */
export interface ScoredPoint {
  winnerId: string;
  score: number;
  heldSeconds: number;
  heldSince: Date;
}

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
  private readonly revisions = new RevisionCounter();
  private startup: Promise<unknown> = Promise.resolve();

  getRevision(guildId: string): number {
    return this.revisions.get(guildId);
  }

  private bumpRevision(guildId: string): void {
    this.revisions.bump(guildId);
  }

  /**
   * Holds live messages and deletions until `reserved` settles, once every
   * guild's replay has taken its queue (syncRound): one coming earlier could
   * score against the message in place before the downtime, and lose the
   * points caught up. Called before the listeners are attached.
   */
  waitForStartup(reserved: Promise<unknown>): void {
    this.startup = reserved.catch(() => undefined);
  }

  async handleMessage(
    message: GameMessage,
    delaySeconds: number
  ): Promise<MessageResult> {
    await this.startup;
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

    // A first message starts the count, and so does a point; a reply too soon
    // keeps the time the previous one counted from, as a later deletion may
    // put that one back.
    const recordMessage = lastMessageWrite(
      guildId,
      channelId,
      { messageId, authorId, sentAt },
      outcome.kind === "tooSoon" ? undefined : sentAt
    );

    const held = outcome.kind === "first" ? null : last;

    if (outcome.kind !== "point") {
      await recordMessage;
      await this.recordDailyHold(guildId, held, sentAt);
      return outcome;
    }

    const [winner, point] = pointWrites(
      guildId,
      outcome.winnerId,
      outcome.heldSeconds,
      sentAt
    );
    const [score] = await prisma.$transaction([winner, recordMessage, point]);

    await this.recordDailyHold(guildId, held, sentAt);
    this.bumpRevision(guildId);
    return { ...outcome, score: score.score };
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

  /**
   * Replays the guild's downtime at startup. Its queue is taken at once,
   * before `load` reads the configuration, so that no live message of the
   * guild comes before the replay; the points caught up are announced from
   * within it, before the next live one.
   */
  syncRound(
    guildId: string,
    load: () => Promise<RoundSync | null>,
    now: Date = new Date()
  ): Promise<void> {
    return this.queue.run(guildId, async () => {
      const round = await load();
      if (!round) {
        return;
      }
      await round.announce(
        await this.replayDowntime(
          guildId,
          round.channelId,
          round.history,
          round.delaySeconds,
          now
        )
      );
    });
  }

  resyncLastMessage(
    guildId: string,
    channelId: string,
    history: HistoryReader,
    delaySeconds: number,
    now: Date = new Date()
  ): Promise<ScoredPoint[]> {
    return this.queue.run(guildId, () =>
      this.replayDowntime(guildId, channelId, history, delaySeconds, now)
    );
  }

  /**
   * Replays the messages posted while the bot was down, as if they had been
   * seen live: the holds count for the point of the day, and a reply after
   * `delaySeconds` scores the 4h point. Returns those points, oldest first.
   * Runs within the guild's queue.
   */
  private async replayDowntime(
    guildId: string,
    channelId: string,
    history: HistoryReader,
    delaySeconds: number,
    now: Date
  ): Promise<ScoredPoint[]> {
    const last = await prisma.fourHourGameLastMessage.findUnique({
      where: { guildId },
    });
    if (!last || last.channelId !== channelId) {
      const latest = await history.latest();
      // Taken up now: whatever it held before, its 4h count starts here, as a
      // first message's would.
      await lastMessageWrite(guildId, channelId, standingOf(latest), now);
      return [];
    }

    // Only the days not closed yet can be credited: reading further back
    // than their start would be useless.
    const closedDay = await this.getClosedDay(guildId, now);
    const openSince = startOfDay(nextDay(closedDay));
    const since = last.sentAt < openSince ? openSince : last.sentAt;
    const read = await history.since(since);
    const found = read.some((message) => message.messageId === last.messageId);

    // When the stored message was not read, the replay starts at the one in
    // place at its time: the stored one was deleted while down (the
    // previous message is back in place, as with a live deletion), or it is
    // older than the open days. If the page limit stopped the reading
    // first, it starts at the oldest message read, and the period it could
    // not reach is credited to nobody.
    let start: ChannelMessage | null = found
      ? last
      : (standingOf(read.filter((message) => message.sentAt <= since)) ??
        read[0] ??
        null);
    // A stored message older than the open days is never read. When the
    // reading stopped inside its author's later series, the series still
    // started with it: the hold counts from it, as it would have live.
    if (
      start &&
      !found &&
      last.sentAt < since &&
      start.authorId === last.authorId &&
      start.sentAt >= last.sentAt
    ) {
      start = last;
    }
    if (!start) {
      // No player message is left: none holds the channel, as after a live
      // deletion of the last one.
      await lastMessageWrite(guildId, channelId, null);
      return [];
    }
    const {
      holds,
      points,
      last: current,
      scoringFrom,
    } = replayMessages(start, read, delaySeconds, last.scoringFrom);
    if (holds.length === 0 && found) {
      return [];
    }

    // Only the longest hold of each day counts: keep it (the first to reach
    // it on a tie, as live), then write each day once. Replaying the daily
    // holds again changes nothing, unlike the 4h points: those are written
    // in one transaction with the new last message, so a replay cut short
    // scores none of them and the next start replays it whole.
    const bestOfDay = new Map<string, { userId: string; seconds: number }>();
    for (const hold of holds) {
      for (const { day, seconds } of splitHold(hold.from, hold.to, closedDay)) {
        if (seconds > (bestOfDay.get(day)?.seconds ?? 0)) {
          bestOfDay.set(day, { userId: hold.authorId, seconds });
        }
      }
    }
    for (const [day, { userId, seconds }] of bestOfDay) {
      await this.creditHolds(guildId, userId, [{ day, seconds }]);
    }
    const scored = await prisma.$transaction(async (tx) => {
      const written: ScoredPoint[] = [];
      for (const { winnerId, heldSeconds, heldSince, awardedAt } of points) {
        const [winner, point] = pointWrites(
          guildId,
          winnerId,
          heldSeconds,
          awardedAt,
          tx
        );
        const { score } = await winner;
        await point;
        written.push({ winnerId, score, heldSeconds, heldSince });
      }
      await lastMessageWrite(guildId, channelId, current, scoringFrom, tx);
      return written;
    });
    if (scored.length > 0) {
      this.bumpRevision(guildId);
    }
    return scored;
  }

  async handleDeletion(
    guildId: string,
    channelId: string,
    messageIds: readonly string[],
    fetchLatest: LatestMessageFetcher
  ): Promise<boolean> {
    await this.startup;
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
      await lastMessageWrite(guildId, channelId, await fetchLatest());
      return true;
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
    // /jd4h-admin set asks for 1 at least: unset removes a score.
    if (!Number.isInteger(score) || score < 1) {
      throw new RangeError(`Invalid score: ${score}`);
    }
    return this.queue.run(guildId, async () => {
      const existing = await this.getScore(guildId, userId);
      await prisma.fourHourGameScore.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, score },
        update: { score },
      });
      this.bumpRevision(guildId);
      return existing === null ? "created" : "updated";
    });
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

  async forgetMember(guildId: string, userId: string): Promise<void> {
    await this.deleteScore(guildId, userId);
    await this.queue.run(guildId, async () => {
      await prisma.fourHourGameLastMessage.deleteMany({
        where: { guildId, authorId: userId },
      });
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
    limit: number,
    offset = 0
  ): Promise<LeaderboardEntry[]> {
    const rows = await prisma.fourHourGameScore.findMany({
      where: { guildId, score: { gt: 0 } },
      orderBy: [{ score: "desc" }, { userId: "asc" }],
      skip: offset,
      take: limit,
    });
    return rows.map((row, index) => ({
      userId: row.userId,
      score: row.score,
      rank: offset + index + 1,
    }));
  }

  /** Players with at least one 4h point, the length of the leaderboard. */
  countPlayers(guildId: string): Promise<number> {
    return prisma.fourHourGameScore.count({
      where: { guildId, score: { gt: 0 } },
    });
  }
}

export default declareService(new FourHourGameService());
