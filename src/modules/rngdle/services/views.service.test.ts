import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rolls: vi.fn(),
  totals: vi.fn(),
  accounts: vi.fn(),
  renderDaily: vi.fn(async (..._args: unknown[]) => Buffer.from("daily")),
  renderOverall: vi.fn(async (..._args: unknown[]) => Buffer.from("overall")),
  renderServer: vi.fn(async (..._args: unknown[]) => Buffer.from("server")),
  renderVersus: vi.fn(async (..._args: unknown[]) => Buffer.from("versus")),
  tierOf: vi.fn((_score: number) => "COMMON"),
}));

vi.mock("./store.service.js", () => ({
  default: {
    revision: () => 0,
    rolls: mocks.rolls,
    totals: mocks.totals,
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
vi.mock("#lib/imaging.js", () => ({
  fetchAvatar: async () => null,
  fetchImage: async () => null,
}));

import { renderProfile } from "#modules/rngdle/rendering/cards.js";
import views, { type ViewContext } from "./views.service.js";

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

beforeEach(() => {
  setup();
  mocks.rolls.mockReset().mockResolvedValue([]);
  mocks.totals.mockReset().mockResolvedValue([]);
  mocks.accounts.mockReset().mockResolvedValue([]);
  mocks.renderDaily.mockClear();
  mocks.renderOverall.mockClear();
  mocks.renderServer.mockClear();
  mocks.renderVersus.mockClear();
  mocks.tierOf.mockReset().mockReturnValue("COMMON");
});

describe("utcDayRange", () => {
  const now = new Date("2026-03-01T15:30:00Z");

  it("covers the current UTC day", () => {
    const [from, to] = views.utcDayRange(0, now);

    expect(from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });

  it("goes back across a month boundary", () => {
    const [from, to] = views.utcDayRange(1, now);

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
    expect(views.periodRange("all")).toEqual({});
  });

  it("covers the calendar month in UTC", () => {
    expect(
      iso(views.periodRange("month", new Date("2026-12-31T23:59:00Z")))
    ).toEqual(["2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]);
  });

  it("covers the ISO week, Monday to Monday, in UTC", () => {
    const week = ["2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z"];

    expect(
      iso(views.periodRange("week", new Date("2026-10-05T00:00:00Z")))
    ).toEqual(week);
    expect(
      iso(views.periodRange("week", new Date("2026-10-11T23:59:59Z")))
    ).toEqual(week);
  });

  it("crosses month and year boundaries for a week", () => {
    expect(
      iso(views.periodRange("week", new Date("2027-01-01T12:00:00Z")))
    ).toEqual(["2026-12-28T00:00:00.000Z", "2027-01-04T00:00:00.000Z"]);
  });
});

describe("parsePeriod", () => {
  it("accepts known periods and falls back to all time", () => {
    expect(views.parsePeriod("week")).toBe("week");
    expect(views.parsePeriod("month")).toBe("month");
    expect(views.parsePeriod(undefined)).toBe("all");
    expect(views.parsePeriod(null)).toBe("all");
    expect(views.parsePeriod("year")).toBe("all");
  });
});

describe("dailyLeaderboard", () => {
  const rowsOf = () =>
    mocks.renderDaily.mock.calls[0]![0] as { rank: number; name: string }[];

  it("ranks the rolls and returns every distinct player tied with the best score as winner", async () => {
    mocks.rolls.mockResolvedValue([
      roll("a", 100),
      roll("b", 100),
      roll("a", 100),
      roll("c", 50),
    ]);

    const board = await views.dailyLeaderboard(context, 0);

    expect(rowsOf().map((row) => [row.rank, row.name])).toEqual([
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

  it("shows at most 25 rows", async () => {
    mocks.rolls.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => roll(`p${i}`, 1000 - i))
    );

    await views.dailyLeaderboard(context, 0);

    expect(rowsOf()).toHaveLength(25);
  });

  it("keeps players Discord cannot resolve, under their RNGdle username", async () => {
    mocks.accounts.mockResolvedValue([
      { guildId: "g", userId: "ghost", username: "ghost-rngdle" },
    ]);
    mocks.rolls.mockResolvedValue([
      roll("ghost", 30),
      roll("a", 20),
      roll("unknown", 10),
    ]);

    const board = await views.dailyLeaderboard(context, 0);

    expect(rowsOf().map((row) => [row.rank, row.name])).toEqual([
      [1, "ghost-rngdle"],
      [2, "nick-a"],
      [3, "?"],
    ]);
    expect(board?.winnerIds).toEqual(["ghost"]);
  });

  it("returns null without rolls", async () => {
    expect(await views.dailyLeaderboard(context, 0)).toBeNull();
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

      const recap = await views.dailyRecap("g", 1);

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
  const totals = Array.from({ length: 25 }, (_, i) => ({
    userId: `p${i}`,
    total: 1000 - i,
  }));

  const rendered = () => {
    const [rows, , , caller] = mocks.renderOverall.mock.calls.at(-1)! as [
      { rank: number }[],
      unknown,
      string,
      { rank: number; name: string } | undefined,
    ];
    return { ranks: rows.map((row) => row.rank), caller };
  };

  beforeEach(() => {
    mocks.totals.mockResolvedValue(totals);
  });

  it("returns null when nobody has a score", async () => {
    mocks.totals.mockResolvedValue([]);

    expect(await views.overallPage(context, 1, "p0")).toBeNull();
  });

  it("renders 10 rows per page and clamps the requested page", async () => {
    expect(await views.overallPage(context, 99, "x")).toMatchObject({
      page: 3,
      pageCount: 3,
    });
    expect(rendered().ranks).toEqual([21, 22, 23, 24, 25]);

    expect(await views.overallPage(context, 0, "x")).toMatchObject({
      page: 1,
      pageCount: 3,
    });
    expect(rendered().ranks).toHaveLength(10);
  });

  it("adds the caller row only when the caller is off the page", async () => {
    await views.overallPage(context, 1, "p14");
    expect(rendered().caller).toMatchObject({ rank: 15, name: "name-p14" });

    await views.overallPage(context, 2, "p14");
    expect(rendered().caller).toBeUndefined();

    await views.overallPage(context, 1, "not-ranked");
    expect(rendered().caller).toBeUndefined();
  });

  it("sums the scores over the requested period, cached separately", async () => {
    await views.overallPage(context, 1, "x");
    await views.overallPage(context, 1, "x", "week");
    await views.overallPage(context, 1, "x", "week");

    expect(mocks.totals).toHaveBeenCalledTimes(2);
    expect(mocks.totals.mock.calls[0]).toEqual([context.guildId, {}]);
    expect(mocks.totals.mock.calls[1]).toEqual([
      context.guildId,
      views.periodRange("week"),
    ]);
  });

  it("falls back to the registered username, then to a placeholder, for unresolved players", async () => {
    mocks.totals.mockResolvedValue([
      { userId: "ghost1", total: 2 },
      { userId: "ghost2", total: 1 },
    ]);
    mocks.accounts.mockResolvedValue([
      { userId: "ghost1", username: "Registered" },
    ]);

    await views.overallPage(context, 1, "x");

    const rows = mocks.renderOverall.mock.calls[0]![0] as { name: string }[];
    expect(rows.map((row) => row.name)).toEqual(["Registered", "?"]);
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

    await views.serverCard(context, {
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

      await views.profileCard(context, {
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
    expect(
      await views.versusCard(context, account("a"), account("b"))
    ).toBeNull();
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

    const image = await views.versusCard(
      context,
      account("a"),
      account("ghost")
    );

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

    await views.versusCard(context, account("a"), account("b"));
    await views.versusCard(context, account("a"), account("b"));
    await views.versusCard(context, account("b"), account("a"));
    await views.versusCard(context, account("a"), account("c"));
    await views.versusCard(context, account("c"), account("b"));

    expect(mocks.renderVersus).toHaveBeenCalledTimes(4);
  });
});
