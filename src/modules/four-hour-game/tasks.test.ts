import type { Client } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Module } from "#lib/module.js";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import {
  fourHourGameConfigSchema,
  type FourHourGameConfigSchema,
} from "./four-hour-game.config.js";
import en from "./i18n/en.json" with { type: "json" };
import fr from "./i18n/fr.json" with { type: "json" };

const closeDays = vi.hoisted(() => vi.fn());
const getDailyStandings = vi.hoisted(() => vi.fn());
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: { closeDays, getDailyStandings },
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
vi.mock("#modules/four-hour-game/services/winner-avatar.js", () => ({
  fetchWinnerAvatar,
}));

const { buildDailyPointEmbed, closeAllDays, fourHourGameTasks } =
  await import("./tasks.js");

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("four-hour-game", { en, fr });
});

const config = (locale: string) =>
  makeTestConfig("four-hour-game", fourHourGameConfigSchema, {}, locale);

const announcement = {
  day: "2026-10-13",
  userId: "bob",
  heldSeconds: 6 * 3600 + 30 * 60,
  total: 4,
  rank: { rank: 2, total: 9 },
  avatarUrl: "https://cdn/bob.png",
};

describe("buildDailyPointEmbed", () => {
  it("names the day, the hold and the daily total", () => {
    const embed = buildDailyPointEmbed(announcement, config("fr")).toJSON();

    expect(embed.title).toBe("Point du jour");
    expect(embed.description).toBe(
      "<@bob> remporte le point du mardi 13 octobre : son message est resté sans réponse **6 h 30 min**, plus longtemps que tout autre ce jour-là.\n" +
        "Total : **4 points du jour** · 2ᵉ sur 9"
    );
    expect(embed.thumbnail?.url).toBe("https://cdn/bob.png");
  });

  it("speaks English and leaves out what is unknown", () => {
    const embed = buildDailyPointEmbed(
      { ...announcement, total: 1, rank: null, avatarUrl: null },
      config("en")
    ).toJSON();

    expect(embed.description).toBe(
      "<@bob> wins the point for Tuesday, October 13: their message went unanswered for **6h 30m**, longer than any other that day.\n" +
        "Total: **1 daily point**"
    );
    expect(embed.thumbnail).toBeUndefined();
  });
});

describe("closeAllDays", () => {
  const send = vi.fn();
  const client = {
    guilds: { fetch: vi.fn(async () => ({ id: "guild" })) },
  } as unknown as Client;
  const module = {
    id: "four-hour-game",
  } as unknown as Module<FourHourGameConfigSchema>;

  beforeEach(() => {
    send.mockReset();
    closeDays.mockReset();
    getActivatedGuildIds.mockResolvedValue(["guild"]);
    getDailyStandings.mockResolvedValue([
      { userId: "alice", score: 5, rank: 1 },
      { userId: "bob", score: 4, rank: 2 },
    ]);
    fetchWinnerAvatar.mockResolvedValue(null);
    getConfigForModuleIn.mockResolvedValue({
      ...config("fr"),
      get: () => ({ id: "game", isSendable: () => true, send }),
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
    expect(second.embeds[0].toJSON().description).toMatch(
      /\nTotal : \*\*4 points du jour\*\* · 2ᵉ sur 2$/
    );
  });

  it("stays silent when no day was closed", async () => {
    closeDays.mockResolvedValue([]);

    await closeAllDays(client, module);

    expect(send).not.toHaveBeenCalled();
  });

  it("closes the days at Paris midnight", () => {
    expect(fourHourGameTasks(module)).toEqual([
      expect.objectContaining({
        schedule: "0 0 * * *",
        timezone: "Europe/Paris",
      }),
    ]);
  });
});
