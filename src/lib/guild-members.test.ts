import { Collection, type Guild, type GuildMember } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.hoisted(() => vi.fn());
vi.mock("./logger.js", () => ({ loggerMaker: () => ({ info }) }));

import {
  allMembers,
  loadAllMembers,
  MEMBERS_FRESH_MS,
} from "./guild-members.js";

beforeEach(() => {
  info.mockClear();
  // Only the clock: promises still settle on their own.
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Moves the clock to `ms` after the epoch. */
function at(ms: number): void {
  vi.setSystemTime(ms);
}

const logs = () => info.mock.calls.map(([message]) => message as string);

const member = (id: string, joinedTimestamp = 0) =>
  ({ id, joinedTimestamp }) as GuildMember;

function guild(memberCount = 1) {
  const cache = new Collection<string, GuildMember>();
  // Like discord.js: the fetched members join the cache, which keeps the
  // others, and the fetched ones alone are returned.
  const fetch = vi.fn(async () => {
    const alice = member("alice");
    cache.set("alice", alice);
    return new Collection([["alice", alice]]);
  });
  return {
    guild: {
      id: "guild-1",
      memberCount,
      members: { cache, fetch },
    } as unknown as Guild,
    cache,
    fetch,
  };
}

/** A fetch that settles when the test says so. */
function pending(fetch: ReturnType<typeof guild>["fetch"]) {
  const settle = {} as {
    resolve: () => void;
    reject: (err: unknown) => void;
  };
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        settle.resolve = () => resolve(new Collection());
        settle.reject = reject;
      })
  );
  return settle;
}

const rateLimited = (seconds: number) =>
  Object.assign(new Error("rate limited"), {
    data: { retry_after: seconds },
  });

describe("allMembers", () => {
  it("shares one request between callers asking at the same time", async () => {
    const { guild: server, fetch } = guild();
    const [first, second] = await Promise.all([
      allMembers(server),
      allMembers(server),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect([...first.keys()]).toEqual(["alice"]);
    expect([...second.keys()]).toEqual(["alice"]);
    expect(logs()).toEqual([
      "Members fetch already in progress, waiting for it | guildId = guild-1 | fetchedAt = 1970-01-01T00:00:00.000Z | refreshAt = 1970-01-01T00:01:00.000Z",
      "Members fetched from Discord | guildId = guild-1 | count = 1 | fetchedAt = 1970-01-01T00:00:00.000Z | refreshAt = 1970-01-01T00:01:00.000Z",
    ]);
  });

  it("answers from the cache while the fetch is fresh, arrivals included", async () => {
    const { guild: server, cache, fetch } = guild();
    await allMembers(server);
    // An arrival, which the GuildMembers intent adds to the cache.
    cache.set("bob", member("bob", 30_000));
    at(MEMBERS_FRESH_MS - 1);
    const members = await allMembers(server);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect([...members.keys()]).toEqual(["alice", "bob"]);
    expect(logs()).toContain(
      "Members served from the bot's cache | guildId = guild-1 | fetchedAt = 1970-01-01T00:00:00.000Z | refreshAt = 1970-01-01T00:01:00.000Z"
    );
  });

  it("fetches again once the fetch is stale", async () => {
    const { guild: server, fetch } = guild();
    await allMembers(server);
    at(MEMBERS_FRESH_MS);
    await allMembers(server);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(logs().at(-1)).toBe(
      "Members fetched from Discord | guildId = guild-1 | count = 1 | fetchedAt = 1970-01-01T00:01:00.000Z | refreshAt = 1970-01-01T00:02:00.000Z"
    );
  });

  it("gives a copy, which the cache's later changes leave alone", async () => {
    const { guild: server, cache } = guild();
    const members = await allMembers(server);
    cache.delete("alice");
    expect(members.has("alice")).toBe(true);
  });

  it("does not keep a failed fetch: the next call asks again", async () => {
    const { guild: server, fetch } = guild();
    fetch.mockRejectedValueOnce(new Error("timeout"));
    await expect(allMembers(server)).rejects.toThrow("timeout");
    // The caller logs the failure, with its own context.
    expect(info).not.toHaveBeenCalled();
    await expect(allMembers(server)).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not stay stuck when handling Discord's answer fails", async () => {
    const { guild: server, cache, fetch } = guild();
    const sweep = vi.spyOn(cache, "sweep").mockImplementationOnce(() => {
      throw new Error("broken member");
    });
    await expect(allMembers(server)).rejects.toThrow("broken member");
    await expect(allMembers(server)).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it("keeps each guild's fetch apart", async () => {
    const a = guild();
    const b = guild();
    await allMembers(a.guild);
    await allMembers(b.guild);
    expect(a.fetch).toHaveBeenCalledTimes(1);
    expect(b.fetch).toHaveBeenCalledTimes(1);
  });

  it("drops from the cache the members gone while the bot missed it", async () => {
    const { guild: server, cache } = guild();
    at(MEMBERS_FRESH_MS * 3);
    // Left during a gap with no departure event: never pruned by discord.js.
    cache.set("ghost", member("ghost", 0));
    // Arrived while the request ran: not in Discord's answer, still here.
    cache.set("newcomer", member("newcomer", MEMBERS_FRESH_MS * 3));
    const members = await allMembers(server);
    expect([...members.keys()].sort()).toEqual(["alice", "newcomer"]);
    expect(cache.has("ghost")).toBe(false);
  });

  it("keeps the cache whole when Discord's answer looks incomplete", async () => {
    // Discord counts 3 members, its answer holds 1: the others may just be
    // missing from it, so nobody is dropped.
    const { guild: server, cache } = guild(3);
    cache.set("bob", member("bob", 0));
    at(MEMBERS_FRESH_MS * 3);
    const members = await allMembers(server);
    expect([...members.keys()].sort()).toEqual(["alice", "bob"]);
  });

  it("waits for a fetch still running past its freshness, without asking again", async () => {
    const { guild: server, fetch } = guild();
    const settle = pending(fetch);
    const first = allMembers(server);
    at(MEMBERS_FRESH_MS + 1);
    const late = allMembers(server);
    settle.resolve();
    await Promise.all([first, late]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not ask again before a rate limit's retry_after", async () => {
    const { guild: server, fetch } = guild();
    const limited = rateLimited(28.5);
    fetch.mockRejectedValueOnce(limited);
    await expect(allMembers(server)).rejects.toBe(limited);
    at(28_000);
    await expect(allMembers(server)).rejects.toBe(limited);
    expect(fetch).toHaveBeenCalledTimes(1);
    at(28_500);
    await expect(allMembers(server)).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("counts retry_after from when Discord refused, not from the request", async () => {
    const { guild: server, fetch } = guild();
    const settle = pending(fetch);
    const first = allMembers(server);
    // The refusal arrives late, the send having waited in a queue.
    at(25_000);
    const limited = rateLimited(28);
    settle.reject(limited);
    await expect(first).rejects.toBe(limited);
    at(30_000);
    await expect(allMembers(server)).rejects.toBe(limited);
    expect(fetch).toHaveBeenCalledTimes(1);
    at(53_000);
    await expect(allMembers(server)).resolves.toBeDefined();
  });

  it("fills the cache without copying it, sharing the request too", async () => {
    const { guild: server, cache, fetch } = guild();
    const clone = vi.spyOn(cache, "clone");
    await Promise.all([loadAllMembers(server), allMembers(server)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.has("alice")).toBe(true);
    // Only allMembers' caller keeps a copy.
    expect(clone).toHaveBeenCalledTimes(1);
  });
});
