import { MessageFlags, type Client } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import {
  fourHourGameConfigSchema,
  type FourHourGameConfigSchema,
} from "#modules/four-hour-game/four-hour-game.config.js";
import en from "#modules/four-hour-game/i18n/en.json" with { type: "json" };
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };

const closeDays = vi.hoisted(() => vi.fn());
const getDailyRank = vi.hoisted(() => vi.fn());
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: { closeDays, getDailyRank },
}));

const getActivatedGuildIds = vi.hoisted(() => vi.fn());
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds },
}));

const getConfigForModuleIn = vi.hoisted(() => vi.fn());
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn },
}));

const fetchWinnerAvatar = vi.hoisted(() => vi.fn());
vi.mock("#modules/four-hour-game/services/winner-avatar.service.js", () => ({
  fetchWinnerAvatar,
}));

const { closeAllDays } = await import("./daily.service.js");

// The bot is on every guild but "gone".
const client = {
  guilds: {
    cache: {
      get: (id: string) =>
        id === "gone" ? undefined : { id, available: true },
    },
  },
} as unknown as Client;

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("four-hour-game", { en, fr });
});

const config = (locale: string) =>
  makeTestConfig("four-hour-game", fourHourGameConfigSchema, {}, locale);

describe("closeAllDays", () => {
  const send = vi.fn();
  const module = {
    id: "four-hour-game",
  } as unknown as Module<FourHourGameConfigSchema>;

  beforeEach(() => {
    send.mockReset();
    closeDays.mockReset();
    getActivatedGuildIds.mockResolvedValue(["guild"]);
    getDailyRank.mockImplementation(async (_guildId, userId) =>
      userId === "alice"
        ? { score: 5, rank: { rank: 1, total: 2 } }
        : { score: 4, rank: { rank: 2, total: 2 } }
    );
    fetchWinnerAvatar.mockResolvedValue(null);
    getConfigForModuleIn.mockResolvedValue({
      ...config("fr"),
      get: () => ({
        id: "game",
        guild: { id: "guild" },
        isSendable: () => true,
        isDMBased: () => false,
        send,
      }),
    });
  });

  it("announces each closed day in the game channel without pinging", async () => {
    closeDays.mockResolvedValue([
      { day: "2026-10-12", userId: "alice", heldSeconds: 3600 },
      { day: "2026-10-13", userId: "bob", heldSeconds: 7200 },
    ]);

    await closeAllDays(client, module);

    expect(closeDays).toHaveBeenCalledWith("guild", "game");
    expect(send).toHaveBeenCalledTimes(2);
    const second = send.mock.calls[1]![0];
    expect(second.allowedMentions).toEqual({ parse: [] });
    expect(second.flags).toBe(MessageFlags.SuppressNotifications);
    expect(second.embeds[0].toJSON().description).toMatch(
      /\nTotal : \*\*4 points du jour\*\* · 2ᵉ sur 2$/
    );
  });

  it("gives each announcement the standings at the end of its own day", async () => {
    closeDays.mockResolvedValue([
      { day: "2026-10-12", userId: "alice", heldSeconds: 3600 },
      { day: "2026-10-13", userId: "alice", heldSeconds: 7200 },
    ]);
    getDailyRank.mockImplementation(async (_guildId, _userId, day) => ({
      score: day === "2026-10-12" ? 1 : 2,
      rank: { rank: 1, total: 1 },
    }));

    await closeAllDays(client, module);

    expect(getDailyRank).toHaveBeenCalledWith("guild", "alice", "2026-10-12");
    expect(getDailyRank).toHaveBeenCalledWith("guild", "alice", "2026-10-13");
    const totals = send.mock.calls.map(
      ([options]) => options.embeds[0].toJSON().description.split("\n")[1]
    );
    expect(totals).toEqual([
      "Total : **1 point du jour** · 1ᵉʳ sur 1",
      "Total : **2 points du jour** · 1ᵉʳ sur 1",
    ]);
  });

  it("keeps announcing the other days when one fails to send", async () => {
    closeDays.mockResolvedValue([
      { day: "2026-10-12", userId: "alice", heldSeconds: 3600 },
      { day: "2026-10-13", userId: "bob", heldSeconds: 7200 },
    ]);
    send.mockRejectedValueOnce(new Error("Missing Permissions"));

    await closeAllDays(client, module);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it("takes the avatar through the game channel's guild", async () => {
    closeDays.mockResolvedValue([
      { day: "2026-10-13", userId: "bob", heldSeconds: 7200 },
    ]);
    const guild = { id: "guild" };
    getConfigForModuleIn.mockResolvedValue({
      ...config("fr"),
      get: () => ({
        id: "game",
        guild,
        isSendable: () => true,
        isDMBased: () => false,
        send,
      }),
    });
    fetchWinnerAvatar.mockResolvedValue("https://cdn/bob.png");
    await closeAllDays(client, module);

    expect(fetchWinnerAvatar).toHaveBeenCalledWith(guild, "bob");
    expect(send.mock.calls[0]![0].embeds[0].toJSON().thumbnail).toEqual({
      url: "https://cdn/bob.png",
    });
  });

  it("still closes the days when the game channel cannot be used", async () => {
    getConfigForModuleIn.mockResolvedValue({
      ...config("fr"),
      get: () => ({ id: "game", isSendable: () => false, send }),
    });
    closeDays.mockResolvedValue([
      { day: "2026-10-13", userId: "bob", heldSeconds: 7200 },
    ]);

    await closeAllDays(client, module);

    expect(closeDays).toHaveBeenCalledWith("guild", "game");
    expect(send).not.toHaveBeenCalled();
  });

  it("closes the other guilds when one fails", async () => {
    getActivatedGuildIds.mockResolvedValue(["broken", "guild"]);
    closeDays.mockImplementation(async (guildId: string) => {
      if (guildId === "broken") {
        throw new Error("database down");
      }
      return [];
    });

    await closeAllDays(client, module);

    expect(closeDays).toHaveBeenCalledWith("guild", "game");
  });

  it("skips a guild the bot left", async () => {
    getActivatedGuildIds.mockResolvedValue(["gone", "guild"]);
    closeDays.mockResolvedValue([]);

    await closeAllDays(client, module);

    expect(getConfigForModuleIn).not.toHaveBeenCalledWith(module, "gone");
    expect(closeDays.mock.calls.map(([guildId]) => guildId)).toEqual(["guild"]);
  });

  it("stays silent when no day was closed", async () => {
    closeDays.mockResolvedValue([]);

    await closeAllDays(client, module);

    expect(send).not.toHaveBeenCalled();
  });
});
