import { MessageFlags, type ButtonInteraction } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import { fourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";
import en from "#modules/four-hour-game/i18n/en.json" with { type: "json" };
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };

const service = vi.hoisted(() => ({
  getRevision: vi.fn(),
  getLeaderboard: vi.fn(),
  getDailyStandings: vi.fn(),
  getRank: vi.fn(),
  getScore: vi.fn(),
  countPlayers: vi.fn(),
}));
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: service,
}));

const resolvePlayers = vi.hoisted(() => vi.fn());
vi.mock("#lib/players.js", () => ({ resolvePlayers }));

const renderLeaderboard = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => Buffer.from("png"))
);
vi.mock("#modules/four-hour-game/rendering/leaderboard-image.js", () => ({
  renderLeaderboard,
}));

vi.mock("#lib/imaging.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/imaging.js")>()),
  fetchImage: async () => null,
}));

const { default: handler, leaderboardMessage } =
  await import("./leaderboard-page.button.js");

beforeAll(async () => {
  await initTestI18n("four-hour-game", { en, fr });
});

const config = () =>
  makeTestConfig("four-hour-game", fourHourGameConfigSchema, {}, "fr");

let guild = 0;
const client = { guilds: { fetch: async () => null } };
const context = () => ({
  client: client as never,
  guildId: `guild-${++guild}`,
  guild: null,
  config: config(),
});

// Ranked players p1…p23, each named after their id.
const ranked = Array.from({ length: 23 }, (_, index) => ({
  userId: `p${index + 1}`,
  score: 100 - index,
  rank: index + 1,
}));

const customIds = (message: Awaited<ReturnType<typeof leaderboardMessage>>) =>
  message.components.flatMap((row) =>
    row
      .toJSON()
      .components.map((button) =>
        "custom_id" in button ? button.custom_id : ""
      )
  );

const drawn = () =>
  renderLeaderboard.mock.calls.at(-1)![0] as {
    rows: { rank: number }[];
    callerRank?: number;
    caller?: { rank: number };
  };

beforeEach(() => {
  vi.clearAllMocks();
  service.getRevision.mockReturnValue(1);
  service.countPlayers.mockResolvedValue(ranked.length);
  service.getLeaderboard.mockImplementation(
    async (_guildId: string, limit: number, offset = 0) =>
      ranked.slice(offset, offset + limit)
  );
  service.getDailyStandings.mockResolvedValue(ranked);
  service.getRank.mockResolvedValue({ rank: 17, total: 23 });
  service.getScore.mockResolvedValue(84);
  resolvePlayers.mockImplementation(
    async (_client: unknown, _guildId: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { name: id, avatar: null }]))
  );
});

describe("leaderboardMessage", () => {
  it("shows a page of ten, with buttons that carry the board and the visibility", async () => {
    const message = await leaderboardMessage(
      context(),
      "hold",
      2,
      "p17",
      "public"
    );

    expect(service.getLeaderboard).toHaveBeenCalledWith(
      expect.any(String),
      10,
      10
    );
    expect(drawn().rows.map((row) => row.rank)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    // On this page: highlighted, no row under the table.
    expect(drawn().callerRank).toBe(17);
    expect(drawn().caller).toBeUndefined();
    expect(customIds(message)).toEqual([
      "jd4h-leaderboard:1:hold:public",
      "jd4h-leaderboard:indicator:hold:public",
      "jd4h-leaderboard:3:hold:public",
    ]);
    const labels = message.components[0]!.toJSON().components.map((button) =>
      "label" in button ? button.label : ""
    );
    expect(labels[1]).toBe("Page 2/3");
  });

  it("keeps the caller under the table on another page", async () => {
    await leaderboardMessage(context(), "hold", 1, "p17", "public");

    expect(drawn().caller).toEqual({
      rank: 17,
      name: "p17",
      score: 84,
      avatar: null,
    });
  });

  it.each([
    [0, 1],
    [9, 3],
  ])("brings page %i back within the leaderboard", async (asked, shown) => {
    const message = await leaderboardMessage(
      context(),
      "hold",
      asked,
      "p17",
      "public"
    );

    expect(service.getLeaderboard).toHaveBeenCalledWith(
      expect.any(String),
      10,
      (shown - 1) * 10
    );
    const labels = message.components[0]!.toJSON().components.map((button) =>
      "label" in button ? button.label : ""
    );
    expect(labels[1]).toBe(`Page ${shown}/3`);
  });

  it("pages the daily standings the same way", async () => {
    const message = await leaderboardMessage(
      context(),
      "daily",
      3,
      "p17",
      "private"
    );

    expect(service.getRank).not.toHaveBeenCalled();
    expect(drawn().rows.map((row) => row.rank)).toEqual([21, 22, 23]);
    expect(drawn().caller?.rank).toBe(17);
    expect(message.content).toBe(
      "**Points du jour** : un point chaque jour au message resté le plus longtemps sans réponse."
    );
    expect(customIds(message)[0]).toBe("jd4h-leaderboard:2:daily:private");
  });

  it("shows no buttons when everything fits on one page", async () => {
    service.countPlayers.mockResolvedValue(4);
    service.getLeaderboard.mockResolvedValue(ranked.slice(0, 4));

    const message = await leaderboardMessage(
      context(),
      "hold",
      1,
      "p17",
      "public"
    );

    expect(message.components).toEqual([]);
  });
});

describe("leaderboard page button", () => {
  function press(args: string[]) {
    const interaction = {
      inGuild: () => true,
      guildId: `guild-${++guild}`,
      guild: null,
      client,
      user: { id: "presser" },
      deferUpdate: vi.fn(async () => {}),
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
    };
    return {
      interaction,
      run: () =>
        handler.execute(
          interaction as unknown as ButtonInteraction,
          args,
          config()
        ),
    };
  }

  it("opens a copy only the presser sees from a public leaderboard", async () => {
    const { interaction, run } = press(["2", "hold", "public"]);
    await run();

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(service.getRank).toHaveBeenCalledWith(
      interaction.guildId,
      "presser"
    );
    const [message] = interaction.editReply.mock.calls[0] as unknown as [
      Awaited<ReturnType<typeof leaderboardMessage>>,
    ];
    expect(customIds(message)[0]).toBe("jd4h-leaderboard:1:hold:private");
  });

  it("pages its own copy in place", async () => {
    const { interaction, run } = press(["3", "daily", "private"]);
    await run();

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(drawn().rows.map((row) => row.rank)).toEqual([21, 22, 23]);
  });

  it("ignores the page indicator", async () => {
    const { interaction, run } = press(["indicator", "hold", "public"]);
    await run();

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });
});
