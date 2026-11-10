import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Client,
  type REST,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchNotReadyError } from "#lib/discord-polyfills/guild-message-search.js";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));
const allMembers = vi.hoisted(() => vi.fn());
vi.mock("#lib/guild-members.js", () => ({ allMembers }));

vi.mock("#lib/database.js", () => ({
  default: { seniorityOverride: db },
}));

const { firstMessageDate, recompute, seniorityStart, sweepDepartures } =
  await import("./overrides.js");

const JOINED = new Date("2024-06-01T10:00:00Z");
const FIRST = "2020-03-15T08:30:00.000Z";

function rest(...bodies: unknown[]) {
  const get = vi.fn();
  for (const body of bodies) {
    get.mockResolvedValueOnce(body);
  }
  return { rest: { get } as unknown as REST, get };
}

const found = (timestamp: string) => ({
  messages: [[{ id: "1", channel_id: "c", timestamp }]],
});

beforeEach(() => {
  vi.clearAllMocks();
  db.findUnique.mockResolvedValue(null);
});

describe("seniorityStart", () => {
  it("takes the earlier of the arrival and the recomputed date", () => {
    const earlier = new Date("2020-01-01");
    expect(seniorityStart(JOINED, earlier)).toBe(earlier);
    expect(seniorityStart(JOINED, new Date("2025-01-01"))).toBe(JOINED);
    expect(seniorityStart(JOINED, undefined)).toBe(JOINED);
  });
});

describe("firstMessageDate", () => {
  it("asks for the member's oldest message, wherever it is", async () => {
    const { rest: client, get } = rest(found(FIRST));
    expect(await firstMessageDate(client, "g", "u", Infinity)).toEqual({
      date: new Date(FIRST),
      partial: false,
    });
    const [route, { query }] = get.mock.calls[0]! as [
      string,
      { query: URLSearchParams },
    ];
    expect(route).toBe("/guilds/g/messages/search");
    expect(Object.fromEntries(query)).toEqual({
      author_id: "u",
      include_nsfw: "true",
      sort_by: "timestamp",
      sort_order: "asc",
      // A full page: Discord may return fewer than asked for old messages.
      limit: "25",
    });
  });

  it("takes the earliest message of the page, whatever its order", async () => {
    const { rest: client } = rest({
      messages: [
        [{ id: "2", channel_id: "c", timestamp: "2021-01-01T00:00:00.000Z" }],
        [{ id: "1", channel_id: "c", timestamp: FIRST }],
      ],
    });
    expect((await firstMessageDate(client, "g", "u", Infinity)).date).toEqual(
      new Date(FIRST)
    );
  });

  it("finds nothing for a member who never posted", async () => {
    const { rest: client } = rest({ messages: [] });
    expect(
      (await firstMessageDate(client, "g", "u", Infinity)).date
    ).toBeNull();
  });

  it("gives up while Discord indexes the guild past the deadline", async () => {
    const { rest: client } = rest({ code: 110000, retry_after: 60 });
    await expect(
      firstMessageDate(client, "g", "u", Date.now() + 1000)
    ).rejects.toBeInstanceOf(SearchNotReadyError);
  });
});

describe("recompute", () => {
  it("stores a first message older than the arrival", async () => {
    const { rest: client } = rest(found(FIRST));
    expect(await recompute(client, "g", "u", JOINED, Infinity)).toEqual({
      since: new Date(FIRST),
      corrected: true,
      partial: false,
    });
    expect(db.upsert).toHaveBeenCalledWith({
      where: { guildId_userId: { guildId: "g", userId: "u" } },
      // Recomputed for a member who is here: no departure to count from.
      create: {
        guildId: "g",
        userId: "u",
        since: new Date(FIRST),
        leftAt: null,
      },
      update: { since: new Date(FIRST), leftAt: null },
    });
  });

  it("keeps the arrival, and stores nothing, when no message is older", async () => {
    const { rest: client } = rest(found("2025-01-01T00:00:00.000Z"));
    expect(await recompute(client, "g", "u", JOINED, Infinity)).toEqual({
      since: JOINED,
      corrected: false,
      partial: false,
    });
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g", userId: "u" },
    });
  });

  it("never moves an earlier recomputed date forward, its message deleted since", async () => {
    const stored = new Date("2018-05-05T00:00:00Z");
    db.findUnique.mockResolvedValue({ since: stored });
    const { rest: client } = rest(found(FIRST));
    expect(await recompute(client, "g", "u", JOINED, Infinity)).toEqual({
      since: stored,
      corrected: true,
      partial: false,
    });
  });

  it("waits for old history rather than say no message is older", async () => {
    const { rest: client } = rest({
      ...found("2025-01-01T00:00:00.000Z"),
      doing_deep_historical_index: true,
    });
    await expect(
      recompute(client, "g", "u", JOINED, Infinity)
    ).rejects.toBeInstanceOf(SearchNotReadyError);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("stores an older message found while old history is indexed", async () => {
    const { rest: client } = rest({
      ...found(FIRST),
      doing_deep_historical_index: true,
    });
    expect(await recompute(client, "g", "u", JOINED, Infinity)).toEqual({
      since: new Date(FIRST),
      corrected: true,
      partial: true,
    });
  });

  it("reads the stored date once the search is over, not before", async () => {
    // A deletion during the search must not be undone by a stale read.
    let answer!: (body: unknown) => void;
    const get = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    const pending = recompute(
      { get } as unknown as REST,
      "g",
      "u",
      JOINED,
      Infinity
    );
    await Promise.resolve();
    expect(db.findUnique).not.toHaveBeenCalled();
    answer(found(FIRST));
    await pending;
    expect(db.findUnique).toHaveBeenCalled();
  });

  it("changes nothing when the search cannot answer", async () => {
    const { rest: client } = rest({ code: 110000, retry_after: 60 });
    await expect(
      recompute(client, "g", "u", JOINED, Date.now() + 1000)
    ).rejects.toBeInstanceOf(SearchNotReadyError);
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
});

// Whether the module is enabled, guild by guild, as the task asks it.
const activeIn = (guildIds: string[]) => async (guildId: string) =>
  guildIds.includes(guildId);

describe("sweepDepartures", () => {
  const NOW = new Date("2026-11-10T00:00:00Z");
  const OVER_A_YEAR = new Date("2025-11-01T00:00:00Z");
  const RECENT = new Date("2026-06-01T00:00:00Z");

  const fetchMember = vi.fn();
  const apiError = (code: number) =>
    new DiscordAPIError({ code, message: "" }, code, 404, "GET", "/", {});

  beforeEach(() => {
    // Without the member list, the sweep asks member by member.
    allMembers.mockRejectedValue(new Error("no members intent"));
  });

  function client(
    present: string[],
    guilds = ["g"],
    available = true
  ): Client<true> {
    fetchMember.mockImplementation(async ({ user }: { user: string }) => {
      if (present.includes(user)) {
        return { id: user };
      }
      throw apiError(RESTJSONErrorCodes.UnknownMember);
    });
    return {
      guilds: {
        cache: new Map(
          guilds.map((id) => [
            id,
            {
              id,
              available,
              memberCount: present.length,
              members: { fetch: fetchMember },
            },
          ])
        ),
      },
    } as unknown as Client<true>;
  }

  it("reads the member list once, rather than asking member by member", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "g", userId: "gone", leftAt: null },
      { guildId: "g", userId: "back", leftAt: RECENT },
    ]);
    allMembers.mockResolvedValue(new Map([["back", {}]]));
    await sweepDepartures(client(["back"]), activeIn(["g"]), NOW);
    expect(allMembers).toHaveBeenCalledTimes(1);
    expect(fetchMember).not.toHaveBeenCalled();
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { guildId: "g", userId: "gone", leftAt: null },
      data: { leftAt: NOW },
    });
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { guildId: "g", userId: "back", leftAt: { not: null } },
      data: { leftAt: null },
    });
  });

  it("asks member by member when the list misses members", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "g", userId: "here", leftAt: null },
    ]);
    // Fewer members than the server counts: "here" may just be missing.
    allMembers.mockResolvedValue(new Map());
    await sweepDepartures(client(["here"]), activeIn(["g"]), NOW);
    expect(fetchMember).toHaveBeenCalledWith({ user: "here", force: true });
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the date a calendar year, leap day included", async () => {
    // Left on 1 March 2027: 365 days later is 29 February 2028, a day early.
    db.findMany.mockResolvedValue([
      {
        guildId: "g",
        userId: "gone",
        leftAt: new Date("2027-03-01T12:00:00Z"),
      },
    ]);
    await sweepDepartures(
      client([]),
      activeIn(["g"]),
      new Date("2028-03-01T04:30:00Z")
    );
    expect(db.deleteMany).not.toHaveBeenCalled();
    await sweepDepartures(
      client([]),
      activeIn(["g"]),
      new Date("2028-03-02T04:30:00Z")
    );
    expect(db.deleteMany).toHaveBeenCalled();
  });

  it("dates a departure, then deletes the date a year later", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "g", userId: "gone", leftAt: null },
      { guildId: "g", userId: "old", leftAt: OVER_A_YEAR },
      { guildId: "g", userId: "recent", leftAt: RECENT },
    ]);
    await sweepDepartures(client([]), activeIn(["g"]), NOW);
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { guildId: "g", userId: "gone", leftAt: null },
      data: { leftAt: NOW },
    });
    // Unless a recompute marked them present meanwhile.
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: {
        guildId: "g",
        userId: "old",
        leftAt: { lt: new Date("2025-11-10T00:00:00Z") },
      },
    });
    // Asked to Discord, not to a cache that may have missed the departure.
    expect(fetchMember).toHaveBeenCalledWith({ user: "gone", force: true });
    expect(db.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.updateMany).toHaveBeenCalledTimes(1);
  });

  it("forgets the departure of a member back, even a year on", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "g", userId: "back", leftAt: OVER_A_YEAR },
      { guildId: "g", userId: "here", leftAt: null },
    ]);
    await sweepDepartures(client(["back", "here"]), activeIn(["g"]), NOW);
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { guildId: "g", userId: "back", leftAt: { not: null } },
      data: { leftAt: null },
    });
    expect(db.updateMany).toHaveBeenCalledTimes(1);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes the dates of a guild where the module is disabled", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "off", userId: "u", leftAt: null },
    ]);
    await sweepDepartures(client([], ["off"]), activeIn([]), NOW);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { guildId: "off" } });
    expect(fetchMember).not.toHaveBeenCalled();
  });

  it("counts an id Discord knows no user for as gone", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "g", userId: "unknown", leftAt: null },
    ]);
    const c = client([]);
    fetchMember.mockRejectedValue(apiError(RESTJSONErrorCodes.UnknownUser));
    await sweepDepartures(c, activeIn(["g"]), NOW);
    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { leftAt: NOW } })
    );
  });

  it("goes on with the other members when one fails", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "g", userId: "broken", leftAt: null },
      { guildId: "g", userId: "gone", leftAt: null },
    ]);
    const c = client([]);
    fetchMember.mockRejectedValueOnce(new Error("Missing Access"));
    await sweepDepartures(c, activeIn(["g"]), NOW);
    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId: "g", userId: "gone", leftAt: null },
      })
    );
  });

  it("goes on with the other guilds when one fails", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "broken", userId: "u", leftAt: null },
      { guildId: "g", userId: "gone", leftAt: null },
    ]);
    const c = client([], ["broken", "g"]);
    // A database blip on one guild's activation, outside the member loop.
    const isActivated = async (guildId: string) => {
      if (guildId === "broken") {
        throw new Error("database down");
      }
      return true;
    };
    await sweepDepartures(c, isActivated, NOW);
    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId: "g", userId: "gone", leftAt: null },
      })
    );
  });

  it("waits for an unavailable guild", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "g", userId: "u", leftAt: OVER_A_YEAR },
    ]);
    await sweepDepartures(client([], ["g"], false), activeIn(["g"]), NOW);
    expect(fetchMember).not.toHaveBeenCalled();
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps the dates of a guild the bot left, as its configuration", async () => {
    db.findMany.mockResolvedValue([
      { guildId: "gone-guild", userId: "u", leftAt: OVER_A_YEAR },
    ]);
    await sweepDepartures(client([], []), activeIn(["gone-guild"]), NOW);
    expect(db.deleteMany).not.toHaveBeenCalled();
    expect(db.updateMany).not.toHaveBeenCalled();
  });
});
