import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rolls: vi.fn(),
  accounts: vi.fn(),
  renderDaily: vi.fn(async (..._args: unknown[]) => Buffer.from("daily")),
  renderOverall: vi.fn(async (..._args: unknown[]) => Buffer.from("overall")),
  renderServer: vi.fn(async (..._args: unknown[]) => Buffer.from("server")),
  renderVersus: vi.fn(async (..._args: unknown[]) => Buffer.from("versus")),
  renderHistory: vi.fn(async (..._args: unknown[]) => Buffer.from("history")),
  tierOf: vi.fn((_score: number) => "COMMON"),
}));

vi.mock("./store.js", () => ({
  default: {
    revision: () => 0,
    rolls: mocks.rolls,
    accounts: mocks.accounts,
    scoreTable: async () => ({
      percentOf: (score: number) => score / 10,
      tierOf: mocks.tierOf,
    }),
  },
}));
vi.mock("#modules/rngdle/rendering/leaderboards.js", () => ({
  renderDailyLeaderboard: mocks.renderDaily,
  renderOverallLeaderboard: mocks.renderOverall,
}));
vi.mock("#modules/rngdle/rendering/cards.js", () => ({
  renderProfile: vi.fn(),
  renderServerStats: mocks.renderServer,
}));
vi.mock("#modules/rngdle/rendering/versus.js", () => ({
  renderVersus: mocks.renderVersus,
}));
vi.mock("#modules/rngdle/rendering/history.js", () => ({
  renderHistory: mocks.renderHistory,
}));
vi.mock("#lib/imaging.js", () => ({
  fetchAvatar: async () => null,
  fetchImage: async () => null,
}));

import { renderProfile } from "#modules/rngdle/rendering/cards.js";
import {
  dailyLeaderboard,
  dailyRecap,
  historyCard,
  overallPage,
  parsePeriod,
  periodRange,
  profileCard,
  serverCard,
  utcDayRange,
  versusCard,
  type ViewContext,
} from "./views.js";

const MEMBERS = new Set(["a"]);
const KNOWN = new Set([
  "a",
  "b",
  "c",
  ...Array.from({ length: 40 }, (_, i) => `p${i}`),
]);

let guild = 0;
let context: ViewContext;

function setup() {
  const guildId = `g${++guild}`;
  context = {
    guildId,
    locale: "en",
    t: ((key: string) => key) as ViewContext["t"],
    client: {
      guilds: {
        cache: new Map([
          [
            guildId,
            {
              iconURL: () => null,
              members: {
                fetch: async ({ user: id }: { user: string }) => {
                  if (!MEMBERS.has(id)) throw new Error("unknown member");
                  return { displayName: `nick-${id}` };
                },
              },
            },
          ],
        ]),
        fetch: async () => {
          throw new Error("unknown guild");
        },
      },
      users: {
        fetch: async (id: string) => {
          if (!KNOWN.has(id)) throw new Error("unknown user");
          return { displayName: `name-${id}` };
        },
      },
    } as unknown as Client,
  };
}

const roll = (userId: string, score: number) => ({ userId, number: 1, score });
const datedRoll = (userId: string, score: number) => ({
  userId,
  number: score,
  score,
  badgeCount: 0,
  rolledAt: new Date("2026-03-01T12:00:00Z"),
});

beforeEach(() => {
  setup();
  mocks.rolls.mockReset().mockResolvedValue([]);
  mocks.accounts.mockReset().mockResolvedValue([]);
  mocks.renderDaily.mockClear();
  mocks.renderOverall.mockClear();
  mocks.renderServer.mockClear();
  mocks.renderVersus.mockClear();
  mocks.renderHistory.mockClear();
  mocks.tierOf.mockReset().mockReturnValue("COMMON");
});

describe("utcDayRange", () => {
  const now = new Date("2026-03-01T15:30:00Z");

  it("covers the current UTC day", () => {
    const [from, to] = utcDayRange(0, now);

    expect(from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });

  it("goes back across a month boundary", () => {
    const [from, to] = utcDayRange(1, now);

    expect(from.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("periodRange", () => {
  const iso = (range: { from?: Date; to?: Date }) => [
    range.from?.toISOString(),
    range.to?.toISOString(),
  ];

  it("is unbounded for all time", () => {
    expect(periodRange("all")).toEqual({});
  });

  it("covers the calendar month in UTC", () => {
    expect(iso(periodRange("month", new Date("2026-12-31T23:59:00Z")))).toEqual(
      ["2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]
    );
  });

  it("covers the ISO week, Monday to Monday, in UTC", () => {
    const week = ["2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z"];

    expect(iso(periodRange("week", new Date("2026-10-05T00:00:00Z")))).toEqual(
      week
    );
    expect(iso(periodRange("week", new Date("2026-10-11T23:59:59Z")))).toEqual(
      week
    );
  });

  it("crosses month and year boundaries for a week", () => {
    expect(iso(periodRange("week", new Date("2027-01-01T12:00:00Z")))).toEqual([
      "2026-12-28T00:00:00.000Z",
      "2027-01-04T00:00:00.000Z",
    ]);
  });
});

describe("parsePeriod", () => {
  it("accepts known periods and falls back to all time", () => {
    expect(parsePeriod("week")).toBe("week");
    expect(parsePeriod("month")).toBe("month");
    expect(parsePeriod(undefined)).toBe("all");
    expect(parsePeriod(null)).toBe("all");
    expect(parsePeriod("year")).toBe("all");
  });
});

describe("dailyLeaderboard", () => {
  const rendered = () =>
    mocks.renderDaily.mock.calls.at(-1)![0] as {
      rows: { rank: number; name: string; delta: number | null }[];
      average: { score: number; rolls: number; previous: number | null };
      players: { count: number; previous: number | null };
      worst: { name: string; score: number } | null;
    };
  const days = (today: object[], previous: object[] = []) =>
    mocks.rolls.mockImplementation(async (_guildId, filter) =>
      filter.byScore ? today : previous
    );

  it("ranks the rolls and returns every distinct player tied with the best score as winner", async () => {
    days([roll("a", 100), roll("b", 100), roll("a", 100), roll("c", 50)]);

    const board = await dailyLeaderboard(context, 0);

    expect(rendered().rows.map((row) => [row.rank, row.name])).toEqual([
      [1, "nick-a"],
      [2, "name-b"],
      [3, "nick-a"],
      [4, "name-c"],
    ]);
    expect(board).toEqual({
      image: Buffer.from("daily"),
      winnerIds: ["a", "b"],
    });
  });

  it("compares the day with the day before, as a whole and per player", async () => {
    vi.useFakeTimers({
      now: new Date("2026-03-02T12:00:00Z"),
      toFake: ["Date"],
    });
    try {
      days(
        [roll("a", 300), roll("b", 100), roll("c", 50)],
        [roll("a", 120), roll("a", 200), roll("b", 150)]
      );

      await dailyLeaderboard(context, 1);

      expect(mocks.rolls).toHaveBeenCalledWith(context.guildId, {
        from: new Date("2026-02-28T00:00:00Z"),
        to: new Date("2026-03-01T00:00:00Z"),
      });
      const data = rendered();
      expect(data.rows.map((row) => row.delta)).toEqual([100, -50, null]);
      expect(data.average).toMatchObject({ score: 150, rolls: 3 });
      expect(data.average.previous).toBe(156);
      expect(data.players).toEqual({ count: 3, previous: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the comparison out when nobody rolled the day before", async () => {
    days([roll("a", 300)]);

    await dailyLeaderboard(context, 0);

    expect(rendered().average.previous).toBeNull();
    expect(rendered().players.previous).toBeNull();
    expect(rendered().rows[0]!.delta).toBeNull();
  });

  it("singles out the worst roll, even below the 25 shown, once two players rolled", async () => {
    days(
      Array.from({ length: 30 }, (_, i) => roll(`p${i}`, 1000 - i)).concat(
        roll("ghost", 1)
      )
    );
    mocks.accounts.mockResolvedValue([
      { guildId: "g", userId: "ghost", username: "ghost-rngdle" },
    ]);

    await dailyLeaderboard(context, 0);

    expect(rendered().rows).toHaveLength(25);
    expect(rendered().worst).toMatchObject({
      name: "ghost-rngdle",
      score: 1,
    });

    days([roll("a", 300), roll("a", 5)]);
    await dailyLeaderboard({ ...context, guildId: `${context.guildId}x` }, 0);
    expect(rendered().worst).toBeNull();
  });

  it("keeps players Discord cannot resolve, under their RNGdle username", async () => {
    mocks.accounts.mockResolvedValue([
      { guildId: "g", userId: "ghost", username: "ghost-rngdle" },
    ]);
    days([roll("ghost", 30), roll("a", 20), roll("unknown", 10)]);

    const board = await dailyLeaderboard(context, 0);

    expect(rendered().rows.map((row) => [row.rank, row.name])).toEqual([
      [1, "ghost-rngdle"],
      [2, "nick-a"],
      [3, "?"],
    ]);
    expect(board?.winnerIds).toEqual(["ghost"]);
  });

  it("returns null without rolls", async () => {
    expect(await dailyLeaderboard(context, 0)).toBeNull();
    expect(mocks.renderDaily).not.toHaveBeenCalled();
  });
});

describe("dailyRecap", () => {
  it("loads the history up to the end of the day and recaps that day", async () => {
    vi.useFakeTimers({
      now: new Date("2026-03-02T01:00:00Z"),
      toFake: ["Date"],
    });
    try {
      mocks.rolls.mockResolvedValue([
        { userId: "a", score: 950, rolledAt: new Date("2026-03-01T10:00:00Z") },
        { userId: "b", score: 20, rolledAt: new Date("2026-03-01T11:00:00Z") },
      ]);

      const recap = await dailyRecap("g", 1);

      expect(mocks.rolls).toHaveBeenCalledWith("g", {
        to: new Date("2026-03-02T00:00:00Z"),
      });
      expect(recap).toMatchObject({
        participants: 2,
        worst: { userId: "b", score: 20 },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("overallPage", () => {
  const players = Array.from({ length: 25 }, (_, i) => [
    datedRoll(`p${i}`, 1000 - i),
    datedRoll(`p${i}`, 1000 - i),
  ]).flat();

  const rendered = () =>
    mocks.renderOverall.mock.calls.at(-1)![0] as {
      players: number;
      rolls: number;
      average: { score: number };
      ranking: { rank: number; name: string; rolls: number; index: number }[];
      caller: { rank: number; name: string } | undefined;
      bestRolls: { rank: number; name: string; score: number }[];
    };

  beforeEach(() => {
    mocks.rolls.mockResolvedValue(players);
  });

  it("returns null when nobody has a roll", async () => {
    mocks.rolls.mockResolvedValue([]);

    expect(await overallPage(context, 1, "p0")).toBeNull();
  });

  it("renders 10 rows per page in both tables and clamps the requested page", async () => {
    expect(await overallPage(context, 99, "x")).toMatchObject({
      page: 3,
      pageCount: 3,
    });
    expect(rendered().ranking.map((row) => row.rank)).toEqual([
      21, 22, 23, 24, 25,
    ]);
    expect(rendered().bestRolls.map((row) => row.rank)).toEqual([
      21, 22, 23, 24, 25,
    ]);

    expect(await overallPage(context, 0, "x")).toMatchObject({
      page: 1,
      pageCount: 3,
    });
    expect(rendered().ranking).toHaveLength(10);
    expect(rendered()).toMatchObject({ players: 25, rolls: 50 });
  });

  it("ranks by the index and lists each player's best roll apart", async () => {
    mocks.rolls.mockResolvedValue([
      ...Array.from({ length: 40 }, () => datedRoll("a", 300)),
      datedRoll("b", 900),
      datedRoll("b", 100),
    ]);

    await overallPage(context, 1, "x");

    expect(rendered().ranking.map((row) => [row.name, row.rolls])).toEqual([
      ["nick-a", 40],
      ["name-b", 2],
    ]);
    expect(rendered().ranking[0]!.index).toBeCloseTo(12_000 / 60);
    expect(
      rendered().bestRolls.map((row) => [row.rank, row.name, row.score])
    ).toEqual([
      [1, "name-b", 900],
      [2, "nick-a", 300],
    ]);
    expect(rendered().average.score).toBe(Math.trunc(13_000 / 42));
  });

  it("adds the caller row only when the caller is off the page", async () => {
    await overallPage(context, 1, "p14");
    expect(rendered().caller).toMatchObject({ rank: 15, name: "name-p14" });

    await overallPage(context, 2, "p14");
    expect(rendered().caller).toBeUndefined();

    await overallPage(context, 1, "not-ranked");
    expect(rendered().caller).toBeUndefined();
  });

  it("ranks over the requested period, cached separately", async () => {
    await overallPage(context, 1, "x");
    await overallPage(context, 1, "x", "week");
    await overallPage(context, 1, "x", "week");

    expect(mocks.rolls).toHaveBeenCalledTimes(2);
    expect(mocks.rolls.mock.calls[0]).toEqual([context.guildId, {}]);
    expect(mocks.rolls.mock.calls[1]).toEqual([
      context.guildId,
      periodRange("week"),
    ]);
  });

  it("falls back to the registered username, then to a placeholder, for unresolved players", async () => {
    mocks.rolls.mockResolvedValue([
      datedRoll("ghost1", 2),
      datedRoll("ghost2", 1),
    ]);
    mocks.accounts.mockResolvedValue([
      { userId: "ghost1", username: "Registered" },
    ]);

    await overallPage(context, 1, "x");

    expect(rendered().ranking.map((row) => row.name)).toEqual([
      "Registered",
      "?",
    ]);
  });
});

describe("historyCard", () => {
  const account = { guildId: "", userId: "a", username: "alice" };
  const day = (date: number, score: number) => ({
    userId: "a",
    number: score,
    score,
    badgeCount: 0,
    rolledAt: new Date(Date.UTC(2026, 2, date, 10)),
  });
  const rendered = () =>
    mocks.renderHistory.mock.calls.at(-1)![0] as {
      username: string;
      rows: { dateText: string; today: boolean; score: number }[];
      averageScore: number;
      averagePercent: number;
      upperHalf: number;
      currentStreak: number;
      bestStreak: number;
    };
  const now = new Date("2026-03-20T12:00:00Z");

  it("returns null without rolls", async () => {
    expect(
      await historyCard(context, { ...account, guildId: context.guildId })
    ).toBeNull();
    expect(mocks.renderHistory).not.toHaveBeenCalled();
  });

  it("lists the latest rolls newest first and sums them up", async () => {
    mocks.rolls.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => day(i + 1, (i + 1) * 100))
    );

    await historyCard(
      context,
      { ...account, guildId: context.guildId },
      5,
      now
    );

    expect(mocks.rolls).toHaveBeenCalledWith(context.guildId, {
      userId: "a",
    });
    const data = rendered();
    expect(data.username).toBe("nick-a");
    expect(data.rows.map((row) => row.score)).toEqual([
      2000, 1900, 1800, 1700, 1600,
    ]);
    expect(data.rows[0]).toMatchObject({
      dateText: "history.today",
      today: true,
    });
    expect(data.rows[1]).toMatchObject({
      dateText: "Thu, Mar 19",
      today: false,
    });
    expect(data.averageScore).toBe(1800);
    expect(data.averagePercent).toBe(180);
    expect(data.upperHalf).toBe(5);
    expect(data).toMatchObject({ currentStreak: 20, bestStreak: 20 });
  });

  it("keeps the count between 5 and 15", async () => {
    mocks.rolls.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => day(i + 1, 100))
    );
    const own = { ...account, guildId: context.guildId };

    await historyCard(context, own, 99, now);
    expect(rendered().rows).toHaveLength(15);

    await historyCard(context, own, 1, now);
    expect(rendered().rows).toHaveLength(5);

    await historyCard(context, own, undefined, now);
    expect(rendered().rows).toHaveLength(10);
  });
});

describe("serverCard", () => {
  const fullRoll = (userId: string, score: number) => ({
    userId,
    number: score,
    score,
    badgeCount: 0,
    rolledAt: new Date("2026-03-01T12:00:00Z"),
  });

  it("names the best and worst rolls after the server nickname, then the RNGdle username", async () => {
    mocks.rolls.mockResolvedValue([fullRoll("a", 900), fullRoll("ghost", 5)]);
    mocks.accounts.mockResolvedValue([
      { userId: "ghost", username: "ghost-rngdle" },
    ]);

    await serverCard(context, {
      id: context.guildId,
      iconURL: () => null,
    } as never);

    const [data] = mocks.renderServer.mock.calls[0]! as [
      { best: { playerName: string }; worst: { playerName: string } },
    ];
    expect(data.best.playerName).toBe("nick-a");
    expect(data.worst.playerName).toBe("ghost-rngdle");
  });
});

describe("profileCard", () => {
  it("passes the current streak and the record to the card", async () => {
    vi.useFakeTimers({
      now: new Date("2026-03-05T12:00:00Z"),
      toFake: ["Date"],
    });
    try {
      const day = (iso: string) => ({
        userId: "a",
        number: 1,
        score: 100,
        badgeCount: 0,
        rolledAt: new Date(iso),
      });
      mocks.rolls.mockResolvedValue([
        day("2026-02-20T10:00:00Z"),
        day("2026-02-21T10:00:00Z"),
        day("2026-02-22T10:00:00Z"),
        day("2026-03-03T10:00:00Z"),
        day("2026-03-04T10:00:00Z"),
      ]);

      await profileCard(context, {
        guildId: context.guildId,
        userId: "a",
        username: "alice",
      });

      expect(vi.mocked(renderProfile)).toHaveBeenLastCalledWith(
        expect.objectContaining({ currentStreak: 2, bestStreak: 3 }),
        expect.anything()
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("versusCard", () => {
  const account = (userId: string) => ({
    guildId: context.guildId,
    userId,
    username: `${userId}-rngdle`,
  });
  const fullRoll = (userId: string, day: number, score: number) => ({
    userId,
    number: score,
    score,
    badgeCount: 1,
    rolledAt: new Date(Date.UTC(2026, 2, day, 12)),
  });

  it("returns null when neither player has a roll", async () => {
    expect(await versusCard(context, account("a"), account("b"))).toBeNull();
    expect(mocks.renderVersus).not.toHaveBeenCalled();
  });

  it("compares the two players, named after their nickname then their RNGdle username", async () => {
    mocks.tierOf.mockImplementation((score) =>
      score >= 100 ? "RARE" : "COMMON"
    );
    mocks.rolls.mockImplementation(async (_guildId, { userId }) =>
      userId === "a"
        ? [fullRoll("a", 1, 100), fullRoll("a", 2, 10)]
        : [fullRoll("ghost", 1, 50)]
    );

    const image = await versusCard(context, account("a"), account("ghost"));

    expect(image).toEqual(Buffer.from("versus"));
    const [data] = mocks.renderVersus.mock.calls[0]! as [
      {
        left: {
          name: string;
          totalScore: number;
          average: { tier: string };
          best: { tier: string };
        };
        right: { name: string; average: { score: number } };
        headToHead: unknown;
        winners: { totalScore: string };
      },
    ];
    expect(data.left).toMatchObject({
      name: "nick-a",
      totalScore: 110,
      average: { score: 55, tier: "COMMON" },
      best: { number: 100, score: 100, tier: "RARE" },
    });
    expect(data.right).toMatchObject({
      name: "ghost-rngdle",
      average: { score: 50, tier: "COMMON" },
    });
    expect(data.headToHead).toEqual({ days: 1, left: 1, right: 0, ties: 0 });
    expect(data.winners.totalScore).toBe("left");
  });

  it("caches each pair in its own order", async () => {
    mocks.rolls.mockImplementation(async (_guildId, { userId }) => [
      fullRoll(userId, 1, userId === "a" ? 100 : 50),
    ]);

    await versusCard(context, account("a"), account("b"));
    await versusCard(context, account("a"), account("b"));
    await versusCard(context, account("b"), account("a"));
    await versusCard(context, account("a"), account("c"));
    await versusCard(context, account("c"), account("b"));

    expect(mocks.renderVersus).toHaveBeenCalledTimes(4);
  });
});
