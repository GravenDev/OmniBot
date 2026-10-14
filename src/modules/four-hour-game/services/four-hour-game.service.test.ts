import { setTimeout as sleep } from "node:timers/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface LastMessageRow {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  sentAt: Date;
}

interface PointRow {
  id: number;
  guildId: string;
  userId: string;
  heldSeconds: number;
  awardedAt: Date;
}

interface DailyBestRow {
  guildId: string;
  day: string;
  userId: string;
  heldSeconds: number;
}

const lastMessages = new Map<string, LastMessageRow>();
const scores = new Map<string, number>();
const points: PointRow[] = [];
const dailyBests = new Map<string, DailyBestRow>();
const closedDays = new Map<string, string>();
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
      async count({
        where,
      }: {
        where: {
          guildId: string;
          score?: { gt: number };
          OR?: (
            | { score: { gt: number } }
            | { score: number; userId: { lt: string } }
          )[];
        };
      }) {
        return [...scores].filter(([k, score]) => {
          const [guildId, userId] = k.split(":") as [string, string];
          if (guildId !== where.guildId) return false;
          if (where.score && !(score > where.score.gt)) return false;
          if (where.OR) {
            return where.OR.some((clause) =>
              typeof clause.score === "number"
                ? score === clause.score &&
                  userId < (clause as { userId: { lt: string } }).userId.lt
                : score > clause.score.gt
            );
          }
          return true;
        }).length;
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
    fourHourGamePoint: {
      async create({ data }: { data: Omit<PointRow, "id"> }) {
        const row = { id: points.length + 1, ...data };
        points.push(row);
        return row;
      },
      async deleteMany({
        where,
      }: {
        where: { guildId: string; userId: string };
      }) {
        const kept = points.filter(
          (row) => row.guildId !== where.guildId || row.userId !== where.userId
        );
        const count = points.length - kept.length;
        points.splice(0, points.length, ...kept);
        return { count };
      },
      async findMany({
        where,
        orderBy,
      }: {
        where: { guildId: string };
        orderBy?: unknown;
      }) {
        const chronological =
          JSON.stringify(orderBy) ===
          JSON.stringify([{ awardedAt: "asc" }, { id: "asc" }]);
        return points
          .filter((row) => row.guildId === where.guildId)
          .sort((a, b) =>
            chronological
              ? a.awardedAt.getTime() - b.awardedAt.getTime() || a.id - b.id
              : 0
          )
          .map(({ userId, heldSeconds, awardedAt }) => ({
            userId,
            heldSeconds,
            awardedAt,
          }));
      },
    },
    fourHourGameDailyBest: {
      async findUnique({
        where,
      }: {
        where: { guildId_day: { guildId: string; day: string } };
      }) {
        const { guildId, day } = where.guildId_day;
        return dailyBests.get(key(guildId, day)) ?? null;
      },
      async upsert({
        create,
        update,
      }: {
        create: DailyBestRow;
        update: Pick<DailyBestRow, "userId" | "heldSeconds">;
      }) {
        const k = key(create.guildId, create.day);
        const current = dailyBests.get(k);
        const row = current ? { ...current, ...update } : create;
        dailyBests.set(k, row);
        return row;
      },
      async findMany({
        where,
      }: {
        where: { guildId: string; day: { gt: string; lte: string } };
      }) {
        return [...dailyBests.values()]
          .filter(
            (row) =>
              row.guildId === where.guildId &&
              row.day > where.day.gt &&
              row.day <= where.day.lte
          )
          .sort((a, b) => a.day.localeCompare(b.day))
          .map(({ day, userId, heldSeconds }) => ({
            day,
            userId,
            heldSeconds,
          }));
      },
      async groupBy({
        where,
      }: {
        where: { guildId: string; day: { lte: string } };
      }) {
        const counts = new Map<string, number>();
        for (const row of dailyBests.values()) {
          if (row.guildId === where.guildId && row.day <= where.day.lte) {
            counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1);
          }
        }
        return [...counts].map(([userId, count]) => ({
          userId,
          _count: { _all: count },
        }));
      },
      async deleteMany({
        where,
      }: {
        where: {
          guildId: string;
          userId?: string;
          day?: { gt?: string; lte?: string };
        };
      }) {
        let count = 0;
        for (const [k, row] of dailyBests) {
          if (
            row.guildId === where.guildId &&
            (where.userId === undefined || row.userId === where.userId) &&
            (where.day?.gt === undefined || row.day > where.day.gt) &&
            (where.day?.lte === undefined || row.day <= where.day.lte)
          ) {
            dailyBests.delete(k);
            count++;
          }
        }
        return { count };
      },
    },
    fourHourGameDailyState: {
      async findUnique({ where }: { where: { guildId: string } }) {
        const closedDay = closedDays.get(where.guildId);
        return closedDay ? { guildId: where.guildId, closedDay } : null;
      },
      async create({ data }: { data: { guildId: string; closedDay: string } }) {
        closedDays.set(data.guildId, data.closedDay);
        return data;
      },
      async update({
        where,
        data,
      }: {
        where: { guildId: string };
        data: { closedDay: string };
      }) {
        closedDays.set(where.guildId, data.closedDay);
        return { guildId: where.guildId, ...data };
      },
      async updateMany({
        where,
        data,
      }: {
        where: { guildId: string; closedDay: string };
        data: { closedDay: string };
      }) {
        if (closedDays.get(where.guildId) !== where.closedDay) {
          return { count: 0 };
        }
        closedDays.set(where.guildId, data.closedDay);
        return { count: 1 };
      },
      async deleteMany({ where }: { where: { guildId: string } }) {
        return { count: closedDays.delete(where.guildId) ? 1 : 0 };
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
const point = (score: number) => ({
  kind: "point",
  winnerId: "alice",
  score,
  heldSeconds: DELAY,
  heldSince: start,
});

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
  points.length = 0;
  dailyBests.clear();
  closedDays.clear();
});

describe("FourHourGameService.handleMessage", () => {
  it("awards the previous author and reports their new score", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    const result = await service.handleMessage(
      message("bob", at(DELAY)),
      DELAY
    );

    expect(result).toEqual(point(1));
    expect(scores.get(key("guild", "alice"))).toBe(1);
    expect(lastMessages.get("guild")?.authorId).toBe("bob");
  });

  it("records the point in the history, dated by the message that awarded it", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    await service.handleMessage(message("bob", at(DELAY + 90)), DELAY);

    expect(points).toEqual([
      {
        id: 1,
        guildId: "guild",
        userId: "alice",
        heldSeconds: DELAY + 90,
        awardedAt: at(DELAY + 90),
      },
    ]);
  });

  it("records nothing when no point is scored", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    await service.handleMessage(message("bob", at(60)), DELAY);

    expect(points).toEqual([]);
  });

  it("increments an existing score", async () => {
    scores.set(key("guild", "alice"), 41);
    await service.handleMessage(message("alice", start), DELAY);
    const result = await service.handleMessage(
      message("bob", at(DELAY)),
      DELAY
    );

    expect(result).toEqual(point(42));
  });

  it("keeps the original message when its author posts again", async () => {
    await service.handleMessage(message("alice", start), DELAY);
    await service.handleMessage(message("alice", at(60)), DELAY);
    const result = await service.handleMessage(
      message("bob", at(DELAY)),
      DELAY
    );

    expect(result).toEqual(point(1));
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

    expect(results).toEqual([point(1), { kind: "tooSoon" }]);
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
    expect(result).toEqual(point(1));
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

describe("FourHourGameService.getRank", () => {
  beforeEach(() => {
    scores.set(key("guild", "alice"), 5);
    scores.set(key("guild", "bob"), 3);
    scores.set(key("guild", "carol"), 3);
    scores.set(key("guild", "dave"), 1);
    scores.set(key("guild", "erin"), 0);
    scores.set(key("other", "zack"), 9);
  });

  it.each([
    ["alice", 1],
    ["bob", 2],
    ["carol", 3],
    ["dave", 4],
  ])("ranks %s at %d among the players who scored", async (userId, rank) => {
    expect(await service.getRank("guild", userId)).toEqual({
      rank,
      total: 4,
    });
  });

  it("matches the leaderboard order", async () => {
    const leaderboard = await service.getLeaderboard("guild", 10);
    const ranks = await Promise.all(
      leaderboard.map((entry) => service.getRank("guild", entry.userId))
    );

    expect(ranks.map((r) => r?.rank)).toEqual(leaderboard.map((e) => e.rank));
  });

  it("returns null for a player without a score", async () => {
    expect(await service.getRank("guild", "nobody")).toBeNull();
    expect(await service.getRank("guild", "erin")).toBeNull();
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

describe("FourHourGameService history removal", () => {
  const seed = (guildId: string, userId: string) =>
    points.push({
      id: points.length + 1,
      guildId,
      userId,
      heldSeconds: DELAY,
      awardedAt: start,
    });

  beforeEach(() => {
    scores.set(key("guild", "alice"), 2);
    seed("guild", "alice");
    seed("guild", "bob");
    seed("other", "alice");
  });

  it("deletes the member's history with their score", async () => {
    expect(await service.deleteScore("guild", "alice")).toBe(true);

    expect(points.map((row) => `${row.guildId}:${row.userId}`)).toEqual([
      "guild:bob",
      "other:alice",
    ]);
  });

  it("deletes the history when the score is set to zero", async () => {
    expect(await service.setScore("guild", "alice", 0)).toBe("removed");

    expect(
      points.some((row) => row.guildId === "guild" && row.userId === "alice")
    ).toBe(false);
  });

  it("keeps the history when the score is set to another value", async () => {
    expect(await service.setScore("guild", "alice", 10)).toBe("updated");

    expect(points).toHaveLength(3);
  });
});

describe("FourHourGameService.getProfile", () => {
  const now = new Date("2026-10-12T12:00:00Z");

  it("returns null for a member without a score", async () => {
    expect(await service.getProfile("guild", "nobody", now)).toBeNull();
  });

  it("combines the score, the rank and the history of the guild", async () => {
    scores.set(key("guild", "alice"), 7);
    scores.set(key("guild", "bob"), 9);
    const award = (userId: string, iso: string, heldSeconds = DELAY) =>
      points.push({
        id: points.length + 1,
        guildId: "guild",
        userId,
        heldSeconds,
        awardedAt: new Date(iso),
      });
    award("bob", "2026-10-03T10:00:00Z");
    award("alice", "2026-10-03T10:00:00Z");
    award("alice", "2026-10-01T10:00:00Z");
    award("alice", "2026-09-30T10:00:00Z", 30_000);
    award("bob", "2026-10-02T10:00:00Z");
    points.push({
      id: points.length + 1,
      guildId: "other",
      userId: "zack",
      heldSeconds: DELAY,
      awardedAt: new Date("2026-10-04T10:00:00Z"),
    });

    expect(await service.getProfile("guild", "alice", now)).toEqual({
      score: 7,
      rank: 2,
      total: 2,
      monthPoints: 2,
      bestHoldSeconds: 30_000,
      currentStreak: 1,
      bestStreak: 2,
      lastPointAt: new Date("2026-10-03T10:00:00Z"),
      dailyPoints: 0,
      dailyRank: null,
    });
  });

  it("caps the month's points at a score lowered by an admin", async () => {
    scores.set(key("guild", "alice"), 1);
    points.push(
      {
        id: points.length + 1,
        guildId: "guild",
        userId: "alice",
        heldSeconds: DELAY,
        awardedAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        id: points.length + 2,
        guildId: "guild",
        userId: "alice",
        heldSeconds: DELAY,
        awardedAt: new Date("2026-10-02T10:00:00Z"),
      }
    );

    expect(await service.getProfile("guild", "alice", now)).toMatchObject({
      score: 1,
      monthPoints: 1,
    });
  });

  it("leaves history values empty for a score set before the history existed", async () => {
    scores.set(key("guild", "alice"), 12);

    expect(await service.getProfile("guild", "alice", now)).toEqual({
      score: 12,
      rank: 1,
      total: 1,
      monthPoints: 0,
      bestHoldSeconds: null,
      currentStreak: 0,
      bestStreak: 0,
      lastPointAt: null,
      dailyPoints: 0,
      dailyRank: null,
    });
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

  it("forgets the days not closed yet, but keeps the closed ones visible", async () => {
    closedDays.set("guild", "2026-10-13");
    for (const day of ["2026-10-13", "2026-10-14"]) {
      dailyBests.set(key("guild", day), {
        guildId: "guild",
        day,
        userId: "alice",
        heldSeconds: 3600,
      });
    }
    const revision = service.getRevision("guild");

    await service.resetRound("guild", new Date("2026-11-20T12:00:00+01:00"));

    expect([...dailyBests.keys()]).toEqual([key("guild", "2026-10-13")]);
    expect(closedDays.get("guild")).toBe("2026-11-19");
    expect(service.getRevision("guild")).toBeGreaterThan(revision);
    expect(await service.getDailyStandings("guild")).toEqual([
      { userId: "alice", score: 1, rank: 1 },
    ]);
    expect(await service.deleteScore("guild", "alice")).toBe(true);
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
    expect(result).toEqual(point(1));
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

  it("credits the replaced message's hold on resync", async () => {
    const paris = (iso: string) => new Date(`${iso}+02:00`);
    await service.handleMessage(
      message("zed", paris("2026-10-14T08:00:00")),
      DELAY
    );
    await service.handleMessage(
      message("alice", paris("2026-10-14T09:00:00")),
      DELAY
    );

    await service.resyncLastMessage(
      "guild",
      "game",
      latest("bob", paris("2026-10-14T22:00:00"))
    );
    const closed = await service.closeDays(
      "guild",
      "game",
      paris("2026-10-15T08:00:00")
    );

    expect(closed).toEqual([
      { day: "2026-10-14", userId: "alice", heldSeconds: 13 * 3600 },
    ]);
  });

  it("keeps the stored message on resync when only its author posted since", async () => {
    const paris = (iso: string) => new Date(`${iso}+02:00`);
    await service.handleMessage(
      message("zed", paris("2026-10-14T08:00:00")),
      DELAY
    );
    await service.handleMessage(
      message("alice", paris("2026-10-14T09:00:00")),
      DELAY
    );

    await service.resyncLastMessage(
      "guild",
      "game",
      latest("alice", paris("2026-10-14T09:00:00"))
    );
    const closed = await service.closeDays(
      "guild",
      "game",
      paris("2026-10-15T08:00:00")
    );

    expect(lastMessages.get("guild")?.sentAt).toEqual(
      paris("2026-10-14T09:00:00")
    );
    expect(closed).toEqual([
      { day: "2026-10-14", userId: "alice", heldSeconds: 15 * 3600 },
    ]);
  });

  it("moves to the author's later run on resync when someone replied in between", async () => {
    const paris = (iso: string) => new Date(`${iso}+02:00`);
    await service.handleMessage(
      message("zed", paris("2026-10-14T09:00:00")),
      DELAY
    );
    await service.handleMessage(
      message("alice", paris("2026-10-14T10:00:00")),
      DELAY
    );

    await service.resyncLastMessage(
      "guild",
      "game",
      latest("alice", paris("2026-10-14T11:30:00"))
    );
    expect(dailyBests.get(key("guild", "2026-10-14"))?.userId).toBe("zed");
    const result = await service.handleMessage(
      message("carol", paris("2026-10-14T14:05:00")),
      DELAY
    );

    expect(lastMessages.get("guild")?.authorId).toBe("carol");
    expect(result.kind).not.toBe("point");
    expect(scores.size).toBe(0);
  });

  it("credits nothing on resync for a message stored in another channel", async () => {
    await service.handleMessage(
      message("alice", start, { channelId: "old" }),
      DELAY
    );

    await service.resyncLastMessage("guild", "game", latest("bob", at(3600)));

    expect(dailyBests.size).toBe(0);
    expect(lastMessages.get("guild")?.authorId).toBe("bob");
  });

  it("starts counting on the first startup, not on the day of a reply missed while down", async () => {
    const paris = (iso: string) => new Date(`${iso}+02:00`);
    lastMessages.set("guild", {
      guildId: "guild",
      channelId: "game",
      messageId: "old",
      authorId: "alice",
      sentAt: paris("2026-10-10T09:00:00"),
    });

    await service.resyncLastMessage(
      "guild",
      "game",
      latest("bob", paris("2026-10-11T09:00:00")),
      paris("2026-10-14T10:00:00")
    );

    expect(closedDays.get("guild")).toBe("2026-10-13");
    expect(dailyBests.size).toBe(0);
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

describe("daily points", () => {
  const HOUR = 3600;
  const paris = (iso: string) => new Date(`${iso}+02:00`);
  const send = (authorId: string, iso: string) =>
    service.handleMessage(message(authorId, paris(iso)), DELAY);
  const best = (day: string) => dailyBests.get(key("guild", day));
  const seedDailyBest = (day: string, userId: string) =>
    dailyBests.set(key("guild", day), {
      guildId: "guild",
      day,
      userId,
      heldSeconds: HOUR,
    });

  it("keeps the longest hold of the day, even below the delay", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await send("bob", "2026-10-14T09:00:00");
    await send("carol", "2026-10-14T11:30:00");
    await send("alice", "2026-10-14T12:00:00");

    expect(best("2026-10-14")).toEqual({
      guildId: "guild",
      day: "2026-10-14",
      userId: "bob",
      heldSeconds: 2.5 * HOUR,
    });
  });

  it("keeps the first holder on a tie", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await send("bob", "2026-10-14T09:00:00");
    await send("carol", "2026-10-14T10:00:00");

    expect(best("2026-10-14")?.userId).toBe("alice");
  });

  it("counts a hold that also scored a 4h point", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await send("bob", "2026-10-14T13:00:00");

    expect(best("2026-10-14")).toMatchObject({
      userId: "alice",
      heldSeconds: 5 * HOUR,
    });
  });

  it("splits a hold at Paris midnight", async () => {
    await send("alice", "2026-10-14T22:00:00");
    await send("bob", "2026-10-15T03:00:00");

    expect(best("2026-10-14")?.heldSeconds).toBe(2 * HOUR);
    expect(best("2026-10-15")?.heldSeconds).toBe(3 * HOUR);
  });

  it("counts nothing for days before the game started tracking them", async () => {
    await send("alice", "2026-10-12T08:00:00");
    closedDays.clear();
    await send("bob", "2026-10-14T09:00:00");

    expect([...dailyBests.keys()]).toEqual([key("guild", "2026-10-14")]);
  });

  it("closes yesterday with the message still standing at midnight", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await send("bob", "2026-10-14T09:00:00");
    await send("carol", "2026-10-14T20:00:00");

    const closed = await service.closeDays(
      "guild",
      "game",
      paris("2026-10-15T00:00:05")
    );

    expect(closed).toEqual([
      { day: "2026-10-14", userId: "bob", heldSeconds: 11 * HOUR },
    ]);
    expect(closedDays.get("guild")).toBe("2026-10-14");

    await send("alice", "2026-10-15T09:00:00");
    expect(best("2026-10-14")?.userId).toBe("bob");
    expect(best("2026-10-15")).toMatchObject({
      userId: "carol",
      heldSeconds: 9 * HOUR,
    });
  });

  it("gives the day to the message standing at midnight when it held longest", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await send("bob", "2026-10-14T09:00:00");

    const closed = await service.closeDays(
      "guild",
      "game",
      paris("2026-10-15T00:00:00")
    );

    expect(closed).toEqual([
      { day: "2026-10-14", userId: "bob", heldSeconds: 15 * HOUR },
    ]);
  });

  it("ignores a standing message from another channel", async () => {
    await send("alice", "2026-10-14T08:00:00");

    expect(
      await service.closeDays("guild", "other", paris("2026-10-15T00:00:00"))
    ).toEqual([]);
    expect(closedDays.get("guild")).toBe("2026-10-14");
  });

  it("closes a day only once", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await send("bob", "2026-10-14T09:00:00");
    const now = paris("2026-10-15T00:00:00");

    await service.closeDays("guild", "game", now);
    expect(await service.closeDays("guild", "game", now)).toEqual([]);
  });

  it("refreshes the cached images when it closes a day", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await send("bob", "2026-10-14T09:00:00");
    const revision = service.getRevision("guild");

    await service.closeDays("guild", "game", paris("2026-10-15T00:00:00"));

    expect(service.getRevision("guild")).toBeGreaterThan(revision);
  });

  it("still reports a 4h point when its daily hold cannot be recorded", async () => {
    await send("alice", "2026-10-14T08:00:00");
    const findUnique = vi
      .spyOn(prisma.fourHourGameDailyBest, "findUnique")
      .mockRejectedValueOnce(new Error("database down"));

    const result = await send("bob", "2026-10-14T13:00:00");

    findUnique.mockRestore();
    expect(result).toMatchObject({ kind: "point", winnerId: "alice" });
  });

  it("still plays the 4h game when the daily state cannot be read", async () => {
    await send("alice", "2026-10-14T08:00:00");
    const findUnique = vi
      .spyOn(prisma.fourHourGameDailyState, "findUnique")
      .mockRejectedValueOnce(new Error("database down"));

    const result = await send("bob", "2026-10-14T13:00:00");

    findUnique.mockRestore();
    expect(result).toMatchObject({ kind: "point", winnerId: "alice" });
    expect(lastMessages.get("guild")?.authorId).toBe("bob");
  });

  it("returns nothing when another process closed the day first", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await send("bob", "2026-10-14T09:00:00");
    const updateMany = vi
      .spyOn(prisma.fourHourGameDailyState, "updateMany")
      .mockResolvedValueOnce({ count: 0 });

    expect(
      await service.closeDays("guild", "game", paris("2026-10-15T00:00:00"))
    ).toEqual([]);
    updateMany.mockRestore();
  });

  it("does not credit the previous channel's message when the game moves", async () => {
    await send("alice", "2026-10-14T08:00:00");
    await service.handleMessage(
      message("bob", paris("2026-10-14T12:00:00"), { channelId: "new" }),
      DELAY
    );

    expect(dailyBests.size).toBe(0);
  });

  it("starts with today on a guild that never played", async () => {
    expect(
      await service.closeDays("guild", "game", paris("2026-10-15T00:00:00"))
    ).toEqual([]);
    expect(closedDays.get("guild")).toBe("2026-10-14");
  });

  it("closes every day missed while the bot was down", async () => {
    await send("alice", "2026-10-13T20:00:00");

    const closed = await service.closeDays(
      "guild",
      "game",
      paris("2026-10-15T10:00:00")
    );

    expect(closed).toEqual([
      { day: "2026-10-13", userId: "alice", heldSeconds: 4 * HOUR },
      { day: "2026-10-14", userId: "alice", heldSeconds: 24 * HOUR },
    ]);
  });

  it("ranks players by closed daily points only", async () => {
    closedDays.set("guild", "2026-10-14");
    seedDailyBest("2026-10-12", "bob");
    seedDailyBest("2026-10-13", "alice");
    seedDailyBest("2026-10-14", "bob");
    seedDailyBest("2026-10-15", "alice");

    expect(await service.getDailyStandings("guild")).toEqual([
      { userId: "bob", score: 2, rank: 1 },
      { userId: "alice", score: 1, rank: 2 },
    ]);
    expect(await service.getDailyRank("guild", "alice")).toEqual({
      score: 1,
      rank: { rank: 2, total: 2 },
    });
    expect(await service.getDailyRank("guild", "carol")).toEqual({
      score: 0,
      rank: null,
    });
  });

  it("ranks players as they stood at the end of a given day", async () => {
    closedDays.set("guild", "2026-10-14");
    seedDailyBest("2026-10-12", "bob");
    seedDailyBest("2026-10-13", "alice");
    seedDailyBest("2026-10-14", "alice");

    expect(await service.getDailyStandings("guild", "2026-10-13")).toEqual([
      { userId: "alice", score: 1, rank: 1 },
      { userId: "bob", score: 1, rank: 2 },
    ]);
    expect(await service.getDailyStandings("guild", "2026-10-20")).toEqual([
      { userId: "alice", score: 2, rank: 1 },
      { userId: "bob", score: 1, rank: 2 },
    ]);
  });

  it("returns a profile for a player with only daily points", async () => {
    closedDays.set("guild", "2026-10-14");
    seedDailyBest("2026-10-14", "alice");

    expect(await service.getProfile("guild", "alice")).toMatchObject({
      score: 0,
      dailyPoints: 1,
      dailyRank: { rank: 1, total: 1 },
    });
  });

  it("removes daily points with the score", async () => {
    closedDays.set("guild", "2026-10-14");
    seedDailyBest("2026-10-14", "alice");

    expect(await service.deleteScore("guild", "alice")).toBe(true);
    expect(dailyBests.size).toBe(0);
  });

  it("reports nothing removed when only today's unclosed best was cleared", async () => {
    closedDays.set("guild", "2026-10-14");
    seedDailyBest("2026-10-15", "alice");

    expect(await service.deleteScore("guild", "alice")).toBe(false);
    expect(dailyBests.size).toBe(0);
  });
});
