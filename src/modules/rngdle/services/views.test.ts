import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rolls: vi.fn(),
  totals: vi.fn(),
  accounts: vi.fn(),
  renderDaily: vi.fn(async (..._args: unknown[]) => Buffer.from("daily")),
  renderOverall: vi.fn(async (..._args: unknown[]) => Buffer.from("overall")),
}));

vi.mock("./store.js", () => ({
  default: {
    revision: () => 0,
    rolls: mocks.rolls,
    totals: mocks.totals,
    accounts: mocks.accounts,
    scoreTable: async () => ({
      percentOf: (score: number) => score / 10,
      tierOf: () => "COMMON",
    }),
  },
}));
vi.mock("#modules/rngdle/rendering/leaderboards.js", () => ({
  renderDailyLeaderboard: mocks.renderDaily,
  renderOverallLeaderboard: mocks.renderOverall,
}));
vi.mock("#modules/rngdle/rendering/cards.js", () => ({
  renderProfile: vi.fn(),
  renderServerStats: vi.fn(),
}));
vi.mock("#lib/imaging.js", () => ({
  fetchAvatar: async () => null,
  fetchImage: async () => null,
}));

import {
  dailyLeaderboard,
  overallPage,
  utcDayRange,
  type ViewContext,
} from "./views.js";

const KNOWN = new Set([
  "a",
  "b",
  "c",
  ...Array.from({ length: 40 }, (_, i) => `p${i}`),
]);

let guild = 0;
let context: ViewContext;

function setup() {
  context = {
    guildId: `g${++guild}`,
    locale: "en",
    t: ((key: string) => key) as ViewContext["t"],
    client: {
      users: {
        fetch: async (id: string) => {
          if (!KNOWN.has(id)) throw new Error("unknown user");
          return { username: `name-${id}` };
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

    const board = await dailyLeaderboard(context, 0);

    expect(rowsOf().map((row) => [row.rank, row.name])).toEqual([
      [1, "name-a"],
      [2, "name-b"],
      [3, "name-a"],
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

    await dailyLeaderboard(context, 0);

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

    const board = await dailyLeaderboard(context, 0);

    expect(rowsOf().map((row) => [row.rank, row.name])).toEqual([
      [1, "ghost-rngdle"],
      [2, "name-a"],
      [3, "?"],
    ]);
    expect(board?.winnerIds).toEqual(["ghost"]);
  });

  it("returns null without rolls", async () => {
    expect(await dailyLeaderboard(context, 0)).toBeNull();
    expect(mocks.renderDaily).not.toHaveBeenCalled();
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

    expect(await overallPage(context, 1, "p0")).toBeNull();
  });

  it("renders 10 rows per page and clamps the requested page", async () => {
    expect(await overallPage(context, 99, "x")).toMatchObject({
      page: 3,
      pageCount: 3,
    });
    expect(rendered().ranks).toEqual([21, 22, 23, 24, 25]);

    expect(await overallPage(context, 0, "x")).toMatchObject({
      page: 1,
      pageCount: 3,
    });
    expect(rendered().ranks).toHaveLength(10);
  });

  it("adds the caller row only when the caller is off the page", async () => {
    await overallPage(context, 1, "p14");
    expect(rendered().caller).toMatchObject({ rank: 15, name: "name-p14" });

    await overallPage(context, 2, "p14");
    expect(rendered().caller).toBeUndefined();

    await overallPage(context, 1, "not-ranked");
    expect(rendered().caller).toBeUndefined();
  });

  it("falls back to the registered username, then to a placeholder, for unresolved players", async () => {
    mocks.totals.mockResolvedValue([
      { userId: "ghost1", total: 2 },
      { userId: "ghost2", total: 1 },
    ]);
    mocks.accounts.mockResolvedValue([
      { userId: "ghost1", username: "Registered" },
    ]);

    await overallPage(context, 1, "x");

    const rows = mocks.renderOverall.mock.calls[0]![0] as { name: string }[];
    expect(rows.map((row) => row.name)).toEqual(["Registered", "?"]);
  });
});
