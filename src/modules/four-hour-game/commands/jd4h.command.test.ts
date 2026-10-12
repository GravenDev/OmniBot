import {
  AttachmentBuilder,
  GuildMember,
  type ChatInputCommandInteraction,
} from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { StatCard } from "#lib/stat-card.js";
import { initTestI18n, makeTestConfig } from "#lib/testing.js";
import {
  type FourHourGameConfigSchema,
  fourHourGameConfigSchema,
} from "#modules/four-hour-game/four-hour-game.config.js";
import en from "#modules/four-hour-game/i18n/en.json" with { type: "json" };
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };
import type { PlayerProfile } from "#modules/four-hour-game/services/four-hour-game.service.js";

const getProfile = vi.hoisted(() => vi.fn());
const getRevision = vi.hoisted(() => vi.fn());
const getLeaderboard = vi.hoisted(() => vi.fn());
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: { getProfile, getRevision, getLeaderboard },
}));

const resolvePlayers = vi.hoisted(() => vi.fn());
vi.mock("#lib/players.js", () => ({ resolvePlayers }));

const renderLeaderboard = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => Buffer.from("png"))
);
vi.mock("#modules/four-hour-game/rendering/leaderboard-image.js", () => ({
  renderLeaderboard,
}));

const renderStatCard = vi.hoisted(() => vi.fn());
vi.mock("#lib/stat-card.js", () => ({ renderStatCard }));

const fetchImage = vi.hoisted(() => vi.fn());
vi.mock("#lib/imaging.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/imaging.js")>()),
  fetchImage,
}));

const { default: command } = await import("./jd4h.command.js");

const PNG = Buffer.from("png");

const profile: PlayerProfile = {
  score: 42,
  rank: 3,
  total: 17,
  monthPoints: 5,
  bestHoldSeconds: 4 * 3600 + 12 * 60,
  currentStreak: 2,
  bestStreak: 6,
  lastPointAt: new Date("2026-10-03T22:30:00Z"),
};

let revision = 0;

beforeAll(async () => {
  await initTestI18n("four-hour-game", { en, fr });
});

beforeEach(() => {
  getProfile.mockReset();
  getRevision.mockReset().mockReturnValue(++revision);
  renderStatCard.mockReset().mockResolvedValue(PNG);
  fetchImage.mockReset().mockResolvedValue(null);
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
  beforeEach(() => {
    renderLeaderboard.mockClear();
  });

  it("names players after their server nickname and drops the ones nobody can find", async () => {
    getLeaderboard.mockResolvedValue([
      { rank: 1, userId: "alice", score: 12 },
      { rank: 2, userId: "ghost", score: 8 },
      { rank: 3, userId: "bob", score: 3 },
    ]);
    resolvePlayers.mockResolvedValue(
      new Map([
        ["alice", { name: "Alice (server)", avatar: null }],
        ["bob", { name: "Bob (server)", avatar: null }],
      ])
    );
    const interaction = leaderboardInteraction();

    await command.execute(interaction, keyConfig);

    expect(resolvePlayers).toHaveBeenCalledWith(
      interaction.client,
      interaction.guildId,
      ["alice", "ghost", "bob"]
    );
    expect(renderLeaderboard.mock.calls[0]![0]).toEqual([
      { rank: 1, name: "Alice (server)", score: 12, avatar: null },
      { rank: 3, name: "Bob (server)", score: 3, avatar: null },
    ]);
  });

  it("answers with the empty message when no player can be found", async () => {
    getLeaderboard.mockResolvedValue([{ rank: 1, userId: "ghost", score: 5 }]);
    resolvePlayers.mockResolvedValue(new Map());
    const interaction = leaderboardInteraction();

    await command.execute(interaction, keyConfig);

    expect(renderLeaderboard).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith("leaderboard.empty");
  });
});

function guildMember(name: string, avatarUrl: string): GuildMember {
  const member = Object.create(GuildMember.prototype) as GuildMember;
  Object.defineProperty(member, "displayName", { value: name });
  Object.defineProperty(member, "displayAvatarURL", {
    value: () => avatarUrl,
  });
  return member;
}

function user(id: string, name: string) {
  return {
    id,
    displayName: name,
    displayAvatarURL: () => `https://cdn/users/${id}.png`,
  };
}

interface ScoreOptions {
  option?: ReturnType<typeof user> | null;
  optionMember?: unknown;
  member?: unknown;
}

function scoreInteraction({
  option = null,
  optionMember = null,
  member = null,
}: ScoreOptions) {
  const calls: string[] = [];
  return {
    calls,
    guildId: "guild",
    inGuild: () => true,
    user: user("caller", "Caller"),
    member,
    options: {
      getSubcommand: () => "score",
      getUser: () => option,
      getMember: () => optionMember,
    },
    deferReply: vi.fn(async () => {
      calls.push("deferReply");
    }),
    editReply: vi.fn(async () => {
      calls.push("editReply");
    }),
  };
}

async function runScore(options: ScoreOptions, locale = "fr") {
  const interaction = scoreInteraction(options);
  await command.execute(
    interaction as unknown as ChatInputCommandInteraction,
    makeTestConfig("four-hour-game", fourHourGameConfigSchema, {}, locale)
  );
  expect(interaction.calls).toEqual(["deferReply", "editReply"]);
  return interaction.editReply.mock.calls[0]![0] as {
    content?: string;
    files?: AttachmentBuilder[];
    allowedMentions?: unknown;
  };
}

function renderedCard(): StatCard {
  expect(renderStatCard).toHaveBeenCalledTimes(1);
  return renderStatCard.mock.calls[0]![0] as StatCard;
}

describe("/jd4h score", () => {
  it("sends the member's card as an attachment", async () => {
    getProfile.mockResolvedValue(profile);

    const reply = await runScore({
      option: user("bob", "Bob"),
      optionMember: guildMember("Bobby", "https://cdn/guilds/bob.png"),
    });

    expect(getProfile).toHaveBeenCalledWith("guild", "bob");
    expect(reply.content).toBeUndefined();
    expect(reply.files).toHaveLength(1);
    expect(reply.files![0]).toBeInstanceOf(AttachmentBuilder);
    expect(reply.files![0]!.attachment).toBe(PNG);
    expect(reply.files![0]!.name).toBe("profile.png");
  });

  it("builds the card from the profile and the server member", async () => {
    getProfile.mockResolvedValue(profile);

    await runScore({
      option: user("bob", "Bob"),
      optionMember: guildMember("Bobby", "https://cdn/guilds/bob.png"),
    });

    expect(fetchImage).toHaveBeenCalledWith("https://cdn/guilds/bob.png");
    const card = renderedCard();
    expect(card).toMatchObject({
      title: "Bobby",
      subtitle: "Jeu des 4h",
      rank: { position: 3, total: 17 },
    });
    expect(card.rows.flat().map((box) => [box.value, box.subtext])).toEqual([
      ["42", undefined],
      ["5", undefined],
      ["4 h 12 min", undefined],
      ["2", "record : 6"],
      ["3 oct. 2026", undefined],
    ]);
  });

  it("falls back to the Discord account when the member left the server", async () => {
    getProfile.mockResolvedValue(profile);

    await runScore({ option: user("bob", "Bob"), optionMember: null });

    expect(fetchImage).toHaveBeenCalledWith("https://cdn/users/bob.png");
    expect(renderedCard().title).toBe("Bob");
  });

  it("shows the caller's own card by default", async () => {
    getProfile.mockResolvedValue(profile);

    await runScore({
      member: guildMember("Captain", "https://cdn/guilds/caller.png"),
    });

    expect(getProfile).toHaveBeenCalledWith("guild", "caller");
    expect(fetchImage).toHaveBeenCalledWith("https://cdn/guilds/caller.png");
    expect(renderedCard().title).toBe("Captain");
  });

  it("says when the member has no score", async () => {
    getProfile.mockResolvedValue(null);

    const reply = await runScore({ option: user("bob", "Bob") }, "en");

    expect(reply).toEqual({
      content: "<@bob> has no score on this server.",
      allowedMentions: { parse: [] },
    });
    expect(renderStatCard).not.toHaveBeenCalled();
  });
});
