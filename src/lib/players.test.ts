import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAvatar } = vi.hoisted(() => ({
  fetchAvatar: vi.fn(async (source: { avatarTag: string }) => source.avatarTag),
}));
vi.mock("./imaging.js", () => ({ fetchAvatar }));

import { resolvePlayers } from "./players.js";

const members: Record<string, { displayName: string; avatarTag: string }> = {
  m1: { displayName: "Nick One", avatarTag: "guild-avatar-m1" },
};
const users: Record<string, { displayName: string; avatarTag: string }> = {
  m1: { displayName: "Global One", avatarTag: "user-avatar-m1" },
  u2: { displayName: "Global Two", avatarTag: "user-avatar-u2" },
};

const membersFetch = vi.fn(async (id: string) => {
  const member = members[id];
  if (!member) throw new Error("Unknown Member");
  return member;
});
const usersFetch = vi.fn(async (id: string) => {
  const user = users[id];
  if (!user) throw new Error("Unknown User");
  return user;
});
const guild = { members: { fetch: membersFetch } };

function fakeClient({
  cached = true,
  fetchable = true,
}: { cached?: boolean; fetchable?: boolean } = {}) {
  return {
    guilds: {
      cache: new Map(cached ? [["g", guild]] : []),
      fetch: vi.fn(async () => {
        if (!fetchable) throw new Error("Unknown Guild");
        return guild;
      }),
    },
    users: { fetch: usersFetch },
  } as unknown as Client;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePlayers", () => {
  it("prefers the server nickname and avatar, falls back to the global user, drops unknown ids", async () => {
    const players = await resolvePlayers(fakeClient(), "g", [
      "m1",
      "u2",
      "ghost",
    ]);

    expect(Object.fromEntries(players)).toEqual({
      m1: { name: "Nick One", avatar: "guild-avatar-m1" },
      u2: { name: "Global Two", avatar: "user-avatar-u2" },
    });
  });

  it("fetches each distinct id once", async () => {
    await resolvePlayers(fakeClient(), "g", ["m1", "m1", "u2", "m1"]);

    expect(membersFetch).toHaveBeenCalledTimes(2);
  });

  it("fetches the guild when it is not cached", async () => {
    const client = fakeClient({ cached: false });

    const players = await resolvePlayers(client, "g", ["m1"]);

    expect(client.guilds.fetch).toHaveBeenCalledWith("g");
    expect(players.get("m1")?.name).toBe("Nick One");
  });

  it("falls back to global users when the guild is unreachable", async () => {
    const players = await resolvePlayers(
      fakeClient({ cached: false, fetchable: false }),
      "g",
      ["m1", "ghost"]
    );

    expect(Object.fromEntries(players)).toEqual({
      m1: { name: "Global One", avatar: "user-avatar-m1" },
    });
  });

  it("returns an empty map without ids, without fetching anything", async () => {
    const client = fakeClient({ cached: false });

    expect((await resolvePlayers(client, "g", [])).size).toBe(0);
    expect(client.guilds.fetch).not.toHaveBeenCalled();
  });
});
