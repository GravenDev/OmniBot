import prisma from "#lib/database.js";
import { declareService, type Service } from "#lib/service.js";
import { evaluateMessage, type MessageOutcome } from "./game-rules.js";

export interface GameMessage {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  sentAt: Date;
}

export type MessageResult =
  | Exclude<MessageOutcome, { kind: "point" }>
  | { kind: "point"; winnerId: string; score: number };

export interface ChannelMessage {
  messageId: string;
  authorId: string;
  sentAt: Date;
}

export type LatestMessageFetcher = () => Promise<ChannelMessage | null>;

export type SetScoreResult = "created" | "updated" | "removed" | "absent";

export interface LeaderboardEntry {
  userId: string;
  score: number;
  rank: number;
}

class FourHourGameService implements Service {
  private readonly guildChains = new Map<string, Promise<unknown>>();
  private readonly revisions = new Map<string, number>();

  getRevision(guildId: string): number {
    return this.revisions.get(guildId) ?? 0;
  }

  private bumpRevision(guildId: string): void {
    this.revisions.set(guildId, this.getRevision(guildId) + 1);
  }

  private serialize<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.guildChains.get(guildId) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.catch(() => undefined);
    this.guildChains.set(guildId, settled);
    void settled.then(() => {
      if (this.guildChains.get(guildId) === settled) {
        this.guildChains.delete(guildId);
      }
    });
    return next;
  }

  handleMessage(
    message: GameMessage,
    delaySeconds: number
  ): Promise<MessageResult> {
    return this.serialize(message.guildId, () =>
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

    if (outcome.kind !== "point") {
      await recordMessage;
      return outcome;
    }

    const [winner] = await prisma.$transaction([
      prisma.fourHourGameScore.upsert({
        where: { guildId_userId: { guildId, userId: outcome.winnerId } },
        create: { guildId, userId: outcome.winnerId, score: 1 },
        update: { score: { increment: 1 } },
      }),
      recordMessage,
    ]);

    this.bumpRevision(guildId);
    return { kind: "point", winnerId: outcome.winnerId, score: winner.score };
  }

  resetRound(guildId: string): Promise<void> {
    return this.serialize(guildId, async () => {
      await prisma.fourHourGameLastMessage.deleteMany({ where: { guildId } });
    });
  }

  resyncLastMessage(
    guildId: string,
    channelId: string,
    fetchLatest: LatestMessageFetcher
  ): Promise<void> {
    return this.serialize(guildId, () =>
      this.replaceLastMessage(guildId, channelId, fetchLatest)
    );
  }

  handleDeletion(
    guildId: string,
    channelId: string,
    messageIds: readonly string[],
    fetchLatest: LatestMessageFetcher
  ): Promise<boolean> {
    return this.serialize(guildId, async () => {
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
      await this.replaceLastMessage(guildId, channelId, fetchLatest);
      return true;
    });
  }

  private async replaceLastMessage(
    guildId: string,
    channelId: string,
    fetchLatest: LatestMessageFetcher
  ): Promise<void> {
    const latest = await fetchLatest();
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

  async deleteScore(guildId: string, userId: string): Promise<boolean> {
    const { count } = await prisma.fourHourGameScore.deleteMany({
      where: { guildId, userId },
    });
    if (count > 0) {
      this.bumpRevision(guildId);
    }
    return count > 0;
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
