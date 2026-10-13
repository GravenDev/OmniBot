import type { APIEmbed, ChatInputCommandInteraction } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import {
  type FourHourGameConfigSchema,
  fourHourGameConfigSchema,
} from "#modules/four-hour-game/four-hour-game.config.js";
import en from "#modules/four-hour-game/i18n/en.json" with { type: "json" };
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };

const mocks = vi.hoisted(() => ({
  getLeaderboard: vi.fn(),
  getScore: vi.fn(),
  getRank: vi.fn(),
  resolvePlayers: vi.fn(),
  renderLeaderboard: vi.fn(async (..._args: unknown[]) => Buffer.from("png")),
}));
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: {
    getLeaderboard: mocks.getLeaderboard,
    getScore: mocks.getScore,
    getRank: mocks.getRank,
    getRevision: () => 0,
  },
}));
vi.mock("#lib/players.js", () => ({ resolvePlayers: mocks.resolvePlayers }));
vi.mock("#modules/four-hour-game/rendering/leaderboard-image.js", () => ({
  renderLeaderboard: mocks.renderLeaderboard,
}));

const { default: command } = await import("./jd4h.command.js");

beforeAll(async () => {
  await initTestI18n("four-hour-game", { en, fr });
});

const keyConfig = {
  locale: "en",
  t: (key: string) => key,
} as unknown as ConfigProvider<FourHourGameConfigSchema>;

let guild = 0;

function leaderboardInteraction() {
  return {
    guildId: `guild-${++guild}`,
    client: { id: "client" },
    inGuild: () => true,
    options: { getSubcommand: () => "leaderboard" },
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  } as unknown as ChatInputCommandInteraction & {
    editReply: ReturnType<typeof vi.fn>;
  };
}

describe("/jd4h leaderboard", () => {
  it("names players after their server nickname and drops the ones nobody can find", async () => {
    mocks.getLeaderboard.mockResolvedValue([
      { rank: 1, userId: "alice", score: 12 },
      { rank: 2, userId: "ghost", score: 8 },
      { rank: 3, userId: "bob", score: 3 },
    ]);
    mocks.resolvePlayers.mockResolvedValue(
      new Map([
        ["alice", { name: "Alice (server)", avatar: null }],
        ["bob", { name: "Bob (server)", avatar: null }],
      ])
    );
    const interaction = leaderboardInteraction();

    await command.execute(interaction, keyConfig);

    expect(mocks.resolvePlayers).toHaveBeenCalledWith(
      interaction.client,
      interaction.guildId,
      ["alice", "ghost", "bob"]
    );
    expect(mocks.renderLeaderboard.mock.calls[0]![0]).toEqual([
      { rank: 1, name: "Alice (server)", score: 12, avatar: null },
      { rank: 3, name: "Bob (server)", score: 3, avatar: null },
    ]);
  });

  it("answers with the empty message when no player can be found", async () => {
    mocks.renderLeaderboard.mockClear();
    mocks.getLeaderboard.mockResolvedValue([
      { rank: 1, userId: "ghost", score: 5 },
    ]);
    mocks.resolvePlayers.mockResolvedValue(new Map());
    const interaction = leaderboardInteraction();

    await command.execute(interaction, keyConfig);

    expect(mocks.renderLeaderboard).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith("leaderboard.empty");
  });
});

function scoreInteraction() {
  return {
    guildId: "guild",
    inGuild: () => true,
    user: { id: "caller" },
    options: {
      getSubcommand: () => "score",
      getUser: () => ({ id: "bob" }),
    },
    reply: vi.fn(),
  };
}

async function runScore(locale: string) {
  const interaction = scoreInteraction();
  await command.execute(
    interaction as unknown as ChatInputCommandInteraction,
    makeTestConfig("four-hour-game", fourHourGameConfigSchema, {}, locale)
  );
  return interaction.reply.mock.calls[0]![0] as {
    content?: string;
    embeds?: { toJSON(): APIEmbed }[];
  };
}

describe("/jd4h score", () => {
  beforeEach(() => {
    mocks.getScore.mockReset();
    mocks.getRank.mockReset();
  });

  it("shows the member's score and rank", async () => {
    mocks.getScore.mockResolvedValue(42);
    mocks.getRank.mockResolvedValue({ rank: 3, total: 17 });

    const reply = await runScore("fr");

    expect(mocks.getRank).toHaveBeenCalledWith("guild", "bob");
    expect(reply.embeds![0]!.toJSON().description).toBe(
      "Le score de <@bob> est **42** — 3ᵉ sur 17."
    );
  });

  it("shows the score alone when the rank is unknown", async () => {
    mocks.getScore.mockResolvedValue(42);
    mocks.getRank.mockResolvedValue(null);

    const reply = await runScore("en");

    expect(reply.embeds![0]!.toJSON().description).toBe(
      "<@bob>'s score is **42**."
    );
  });

  it("says when the member has no score", async () => {
    mocks.getScore.mockResolvedValue(null);
    mocks.getRank.mockResolvedValue(null);

    const reply = await runScore("en");

    expect(reply.content).toBe("<@bob> has no score on this server.");
  });
});
