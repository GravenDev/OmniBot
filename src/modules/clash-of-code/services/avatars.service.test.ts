import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchImage: vi.fn(async (url: string | null) =>
    url ? `image:${url}` : null
  ),
  resolvePlayers: vi.fn(),
}));
vi.mock("#lib/imaging.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/imaging.js")>()),
  fetchImage: mocks.fetchImage,
}));
vi.mock("#lib/players.js", () => ({ resolvePlayers: mocks.resolvePlayers }));

const { default: avatars } = await import("./avatars.service.js");

function clientWith(
  cached: { iconURL: () => string | null } | undefined,
  fetched: { iconURL: () => string | null } | Error = new Error("Unknown Guild")
) {
  return {
    guilds: {
      cache: new Map(cached ? [["g1", cached]] : []),
      fetch: vi.fn(async () => {
        if (fetched instanceof Error) {
          throw fetched;
        }
        return fetched;
      }),
    },
  } as unknown as Client;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guildIcon", () => {
  it("draws the icon of a cached guild without asking Discord", async () => {
    const client = clientWith({ iconURL: () => "https://cdn/icon.png" });

    expect(await avatars.guildIcon(client, "g1")).toBe(
      "image:https://cdn/icon.png"
    );
    expect(client.guilds.fetch).not.toHaveBeenCalled();
  });

  it("fetches a guild missing from the cache", async () => {
    const client = clientWith(undefined, {
      iconURL: () => "https://cdn/fetched.png",
    });

    expect(await avatars.guildIcon(client, "g1")).toBe(
      "image:https://cdn/fetched.png"
    );
  });

  it("draws no icon for a guild Discord no longer gives", async () => {
    expect(await avatars.guildIcon(clientWith(undefined), "g1")).toBeNull();
  });
});

describe("playerAvatars", () => {
  it("takes the CodinGame avatar, else the linked member's Discord one", async () => {
    mocks.resolvePlayers.mockResolvedValue(
      new Map([["u2", { avatar: "discord:u2" }]])
    );
    const players = [
      { codingamerId: 1, nickname: "a", avatarId: 42n, userId: "u1" },
      { codingamerId: 2, nickname: "b", avatarId: null, userId: "u2" },
      { codingamerId: 3, nickname: "c", avatarId: null, userId: null },
    ];

    const result = await avatars.playerAvatars({} as Client, "g1", players);

    // Only the members without a CodinGame avatar are asked of Discord.
    expect(mocks.resolvePlayers).toHaveBeenCalledWith({}, "g1", ["u2"]);
    expect(result).toEqual(
      new Map([
        [1, expect.stringMatching(/^image:https:\/\/.*id=42&/)],
        [2, "discord:u2"],
        [3, null],
      ])
    );
  });
});
