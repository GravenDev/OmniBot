import type { REST } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchNotReadyError } from "#lib/discord-polyfills/guild-message-search.js";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("#lib/database.js", () => ({
  default: { seniorityOverride: db },
}));

const { firstMessageDate, recompute, seniorityStart } =
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
      create: { guildId: "g", userId: "u", since: new Date(FIRST) },
      update: { since: new Date(FIRST) },
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
