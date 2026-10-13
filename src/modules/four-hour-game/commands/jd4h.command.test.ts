import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";

const mocks = vi.hoisted(() => ({
  getLeaderboard: vi.fn(),
  resolvePlayers: vi.fn(),
  renderLeaderboard: vi.fn(async (..._args: unknown[]) => Buffer.from("png")),
}));
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: { getLeaderboard: mocks.getLeaderboard, getRevision: () => 0 },
}));
vi.mock("#lib/players.js", () => ({ resolvePlayers: mocks.resolvePlayers }));
vi.mock("#modules/four-hour-game/rendering/leaderboard-image.js", () => ({
  renderLeaderboard: mocks.renderLeaderboard,
}));

const { default: command } = await import("./jd4h.command.js");

const config = {
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

    await command.execute(interaction, config);

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

    await command.execute(interaction, config);

    expect(mocks.renderLeaderboard).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith("leaderboard.empty");
  });
});
