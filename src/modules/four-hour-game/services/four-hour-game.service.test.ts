import { setTimeout as sleep } from "node:timers/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface LastMessageRow {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  sentAt: Date;
}

const lastMessages = new Map<string, LastMessageRow>();
const scores = new Map<string, number>();
const key = (guildId: string, userId: string) => `${guildId}:${userId}`;

vi.mock("#lib/database.js", () => ({
  default: {
    fourHourGameLastMessage: {
      async findUnique({ where }: { where: { guildId: string } }) {
        const row = lastMessages.get(where.guildId) ?? null;
        await sleep(5);
        return row;
      },
      async upsert({
        create,
      }: {
        create: LastMessageRow;
        update: Partial<LastMessageRow>;
      }) {
        lastMessages.set(create.guildId, create);
        return create;
      },
      async deleteMany({ where }: { where: { guildId: string } }) {
        const count = lastMessages.delete(where.guildId) ? 1 : 0;
        return { count };
      },
    },
    fourHourGameScore: {
      async findUnique({
        where,
      }: {
        where: { guildId_userId: { guildId: string; userId: string } };
      }) {
        const { guildId, userId } = where.guildId_userId;
        const score = scores.get(key(guildId, userId));
        return score === undefined ? null : { guildId, userId, score };
      },
      async deleteMany({
        where,
      }: {
        where: { guildId: string; userId: string };
      }) {
        const count = scores.delete(key(where.guildId, where.userId)) ? 1 : 0;
        return { count };
      },
      async findMany({
        where,
        take,
      }: {
        where: { guildId: string; score?: { gt: number } };
        take: number;
      }) {
        return [...scores]
          .map(([k, score]) => {
            const [guildId, userId] = k.split(":") as [string, string];
            return { guildId, userId, score };
          })
          .filter(
            (row) =>
              row.guildId === where.guildId &&
              (where.score === undefined || row.score > where.score.gt)
          )
          .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
          .slice(0, take);
      },
      async upsert({
        create,
        update,
      }: {
        create: { guildId: string; userId: string; score: number };
        update: { score: number | { increment: number } };
      }) {
        const k = key(create.guildId, create.userId);
        const current = scores.get(k);
        const score =
          current === undefined
            ? create.score
            : typeof update.score === "number"
              ? update.score
              : current + update.score.increment;
        scores.set(k, score);
        return { ...create, score };
      },
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));

const { default: prisma } = await import("#lib/database.js");
const { default: service } = await import("./four-hour-game.service.js");

const DELAY = 4 * 60 * 60;
const start = new Date("2026-10-02T10:00:00Z");
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

function message(
  authorId: string,
  sentAt: Date,
  { guildId = "guild", channelId = "game" } = {}
) {
  return {
    guildId,
    channelId,
    messageId: `${authorId}-${sentAt.getTime()}`,
    authorId,
    sentAt,
  };
}

beforeEach(() => {
  lastMessages.clear();
  scores.clear();
});

describe("FourHourGameService.handleMessage", () => {
  it("awards the previous author and reports their new score", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    const result = await service.handleMessage(
      message("bob", at(DELAY)),
      DELAY
    );

    expect(result).toEqual({ kind: "point", winnerId: "alice", score: 1 });
    expect(scores.get(key("guild", "alice"))).toBe(1);
    expect(lastMessages.get("guild")?.authorId).toBe("bob");
  });

  it("increments an existing score", async () => {
    scores.set(key("guild", "alice"), 41);
    await service.handleMessage(message("alice", start), DELAY);
    const result = await service.handleMessage(
      message("bob", at(DELAY)),
      DELAY
    );

    expect(result).toEqual({ kind: "point", winnerId: "alice", score: 42 });
  });

  it("keeps the original message when its author posts again", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    await service.handleMessage(message("alice", at(60)), DELAY);
    const result = await service.handleMessage(
      message("bob", at(DELAY)),
      DELAY
    );

    expect(result).toEqual({ kind: "point", winnerId: "alice", score: 1 });
  });

  it("replaces the last message without scoring when the reply is too soon", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    const result = await service.handleMessage(message("bob", at(60)), DELAY);

    expect(result).toEqual({ kind: "tooSoon" });
    expect(scores.size).toBe(0);
    expect(lastMessages.get("guild")?.authorId).toBe("bob");
  });

  it("does not let two simultaneous messages both score off the same one", async () => {
    await service.handleMessage(message("alice", start), DELAY);

    const results = await Promise.all([
      service.handleMessage(message("bob", at(DELAY)), DELAY),
      service.handleMessage(message("carol", at(DELAY)), DELAY),
    ]);

    expect(results).toEqual([
      { kind: "point", winnerId: "alice", score: 1 },
      { kind: "tooSoon" },
    ]);
    expect(scores.get(key("guild", "alice"))).toBe(1);
  });

  it("keeps processing a guild after a failed message", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    vi.spyOn(
      prisma.fourHourGameLastMessage,
      "findUnique"
    ).mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      service.handleMessage(message("bob", at(DELAY)), DELAY)
    ).rejects.toThrow("database unavailable");

    const result = await service.handleMessage(
      message("carol", at(DELAY)),
      DELAY
    );
    expect(result).toEqual({ kind: "point", winnerId: "alice", score: 1 });
  });

  it("keeps the newest message when an older one is processed after it", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    await service.handleMessage(message("bob", at(61)), DELAY);

    const result = await service.handleMessage(message("carol", at(60)), DELAY);

    expect(result).toEqual({ kind: "outdated" });
    expect(lastMessages.get("guild")?.authorId).toBe("bob");
  });

  it("does not award a message left in the previous game channel", async () => {
    await service.handleMessage(
      message("alice", start, { channelId: "old" }),
      DELAY
    );

    const result = await service.handleMessage(
      message("bob", at(DELAY)),
      DELAY
    );

    expect(result).toEqual({ kind: "first" });
    expect(scores.size).toBe(0);
    expect(lastMessages.get("guild")?.channelId).toBe("game");
  });

  it("keeps guilds independent", async () => {
    await service.handleMessage(
      message("alice", start, { guildId: "g1" }),
      DELAY
    );
    const result = await service.handleMessage(
      message("bob", at(DELAY), { guildId: "g2" }),
      DELAY
    );

    expect(result).toEqual({ kind: "first" });
  });
});

describe("FourHourGameService.getLeaderboard", () => {
  it("ranks players by score and leaves out those at zero", async () => {
    scores.set(key("guild", "alice"), 2);
    scores.set(key("guild", "bob"), 0);
    scores.set(key("guild", "carol"), 5);
    scores.set(key("other", "dave"), 9);

    expect(await service.getLeaderboard("guild", 10)).toEqual([
      { userId: "carol", score: 5, rank: 1 },
      { userId: "alice", score: 2, rank: 2 },
    ]);
  });
});

describe("FourHourGameService.setScore", () => {
  it("creates then updates a score", async () => {
    expect(await service.setScore("guild", "alice", 3)).toBe("created");
    expect(await service.setScore("guild", "alice", 7)).toBe("updated");
    expect(scores.get(key("guild", "alice"))).toBe(7);
  });

  it("treats a score of zero as removing it", async () => {
    scores.set(key("guild", "alice"), 4);

    expect(await service.setScore("guild", "alice", 0)).toBe("removed");
    expect(scores.has(key("guild", "alice"))).toBe(false);
    expect(await service.setScore("guild", "alice", 0)).toBe("absent");
    expect(scores.has(key("guild", "alice"))).toBe(false);
  });
});

describe("FourHourGameService.resetRound", () => {
  it("forgets the guild's last message so a stale one cannot score", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    await service.handleMessage(
      message("alice", start, { guildId: "other" }),
      DELAY
    );

    await service.resetRound("guild");
    const result = await service.handleMessage(
      message("bob", at(DELAY * 10)),
      DELAY
    );

    expect(result).toEqual({ kind: "first" });
    expect(scores.size).toBe(0);
    expect(lastMessages.has("other")).toBe(true);
  });
});

describe("FourHourGameService deletions and resync", () => {
  const latest = (authorId: string, sentAt: Date) => async () => ({
    messageId: `${authorId}-${sentAt.getTime()}`,
    authorId,
    sentAt,
  });

  it("falls back to the channel's real last message when the stored one is deleted", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    await service.handleMessage(message("bob", at(60)), DELAY);

    const handled = await service.handleDeletion(
      "guild",
      "game",
      [`bob-${at(60).getTime()}`],
      latest("alice", start)
    );

    expect(handled).toBe(true);
    expect(lastMessages.get("guild")?.authorId).toBe("alice");
    const result = await service.handleMessage(
      message("carol", at(DELAY)),
      DELAY
    );
    expect(result).toEqual({ kind: "point", winnerId: "alice", score: 1 });
  });

  it("ignores deletions of messages other than the stored last one", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    const fetchLatest = vi.fn(latest("bob", at(1)));

    const handled = await service.handleDeletion(
      "guild",
      "game",
      ["some-other-message"],
      fetchLatest
    );

    expect(handled).toBe(false);
    expect(fetchLatest).not.toHaveBeenCalled();
    expect(lastMessages.get("guild")?.authorId).toBe("alice");
  });

  it("ignores deletions in another channel", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    const id = `alice-${start.getTime()}`;

    expect(
      await service.handleDeletion(
        "guild",
        "elsewhere",
        [id],
        latest("bob", start)
      )
    ).toBe(false);
  });

  it("forgets the round when no player message is left in the channel", async () => {
    await service.handleMessage(message("alice", start), DELAY);

    await service.handleDeletion(
      "guild",
      "game",
      [`alice-${start.getTime()}`],
      async () => null
    );

    expect(lastMessages.has("guild")).toBe(false);
  });

  it("replaces the stored last message with the channel's real one on resync", async () => {
    await service.handleMessage(message("alice", start), DELAY);

    await service.resyncLastMessage("guild", "game", latest("dave", at(3600)));

    expect(lastMessages.get("guild")).toMatchObject({
      channelId: "game",
      authorId: "dave",
      sentAt: at(3600),
    });
  });
});

describe("FourHourGameService.getRevision", () => {
  it("changes whenever a score of the guild changes, and only then", async () => {
    const guildId = "rev-guild";
    const initial = service.getRevision(guildId);

    await service.handleMessage(message("alice", start, { guildId }), DELAY);
    await service.handleMessage(message("bob", at(60), { guildId }), DELAY);
    expect(service.getRevision(guildId)).toBe(initial);

    await service.handleMessage(
      message("carol", at(60 + DELAY), { guildId }),
      DELAY
    );
    const afterPoint = service.getRevision(guildId);
    expect(afterPoint).toBeGreaterThan(initial);

    await service.setScore(guildId, "alice", 4);
    const afterSet = service.getRevision(guildId);
    expect(afterSet).toBeGreaterThan(afterPoint);

    await service.deleteScore(guildId, "nobody");
    expect(service.getRevision(guildId)).toBe(afterSet);
    await service.deleteScore(guildId, "alice");
    expect(service.getRevision(guildId)).toBeGreaterThan(afterSet);
  });
});
