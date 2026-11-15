import { beforeAll, describe, expect, it } from "vitest";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import { fourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import en from "#modules/four-hour-game/i18n/en.json" with { type: "json" };
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };
import { buildDailyPointEmbed } from "./point-announcement.js";

beforeAll(async () => {
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

  it("sends the whole announcement, in green", () => {
    expect(buildDailyPointEmbed(announcement, config("fr")).toJSON()).toEqual({
      title: "Point du jour",
      description:
        "<@bob> remporte le point du mardi 13 octobre : son message est resté sans réponse **6 h 30 min**, plus longtemps que tout autre ce jour-là.\n" +
        "Total : **4 points du jour** · 2ᵉ sur 9",
      color: 0x00ff00,
      thumbnail: { url: "https://cdn/bob.png" },
    });
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
