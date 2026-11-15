import type { Guild } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyStats } from "./store.js";

const mocks = vi.hoisted(() => ({
  fetchImage: vi.fn(async (url: string | null) => (url ? { url } : null)),
  resolvePlayers: vi.fn(
    async () => new Map([["9", { name: "Lolo", avatar: null }]])
  ),
}));
vi.mock("#lib/imaging.js", () => ({ fetchImage: mocks.fetchImage }));
vi.mock("#lib/players.js", () => ({ resolvePlayers: mocks.resolvePlayers }));

const { default: reportAssets } = await import("./report-assets.service.js");

const guild = {
  id: "guild-1",
  iconURL: () => "icon.png",
  client: { client: true },
} as unknown as Guild;

const stats = {
  topMembers: [
    { id: "9", count: 158 },
    { id: "left", count: 40 },
  ],
  topReactions: [
    { id: "👍", count: 19 },
    { id: "<a:e:456>", count: 10 },
    { id: "<:e:789>", count: 3 },
  ],
} as DailyStats;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reportAssets.fetch", () => {
  it("reads the guild's icon and the image of each custom emoji, by its key", async () => {
    const assets = await reportAssets.fetch(guild, stats, true);
    expect(assets.icon).toEqual({ url: "icon.png" });
    expect([...assets.emojis]).toEqual([
      [
        "<a:e:456>",
        { url: "https://cdn.discordapp.com/emojis/456.png?size=64" },
      ],
      [
        "<:e:789>",
        { url: "https://cdn.discordapp.com/emojis/789.png?size=64" },
      ],
    ]);
  });

  it("reads the names and avatars of the top members", async () => {
    const assets = await reportAssets.fetch(guild, stats, true);
    expect(mocks.resolvePlayers).toHaveBeenCalledWith(
      { client: true },
      "guild-1",
      ["9", "left"]
    );
    expect(assets.players?.get("9")?.name).toBe("Lolo");
  });

  it("asks nothing about the members when they are not shown", async () => {
    const assets = await reportAssets.fetch(guild, stats, false);
    expect(mocks.resolvePlayers).not.toHaveBeenCalled();
    expect(assets.players).toBeNull();
  });
});
