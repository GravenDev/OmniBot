import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";

const mocks = vi.hoisted(() => ({
  linked: new Set<string>(),
  refreshIfStale: vi.fn(async () => undefined),
  versusCard: vi.fn(async (): Promise<Buffer | null> => Buffer.from("png")),
}));

vi.mock("#modules/rngdle/services/store.js", () => ({
  default: {
    account: async (guildId: string, userId: string) =>
      mocks.linked.has(userId)
        ? { guildId, userId, username: `${userId}-rngdle` }
        : null,
  },
}));
vi.mock("#modules/rngdle/services/sync.js", () => ({
  default: { refreshIfStale: mocks.refreshIfStale },
}));
vi.mock("#modules/rngdle/services/views.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  versusCard: mocks.versusCard,
}));
vi.mock("#modules/rngdle/interactions/overall-page.button.js", () => ({
  overallPageMessage: vi.fn(),
}));

const { default: command } = await import("./rngdle.command.js");

const config = {
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
} as unknown as ConfigProvider<RngdleConfigSchema>;

function interaction(player1: string, player2: string | null) {
  return {
    guildId: "guild",
    client: {},
    inGuild: () => true,
    user: { id: "caller" },
    options: {
      getSubcommand: () => "versus",
      getString: () => null,
      getUser: (name: string) => {
        if (name === "player1") return { id: player1 };
        if (name === "player2") return player2 ? { id: player2 } : null;
        return null;
      },
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
}

async function run(player1: string, player2: string | null) {
  const target = interaction(player1, player2);
  await command.execute(
    target as unknown as ChatInputCommandInteraction,
    config
  );
  return target;
}

beforeEach(() => {
  mocks.linked = new Set(["caller", "alice", "bob"]);
  mocks.refreshIfStale.mockClear();
  mocks.versusCard.mockClear();
});

describe("/rngdle versus", () => {
  it("compares the first player with the caller by default", async () => {
    const target = await run("alice", null);

    expect(target.reply).not.toHaveBeenCalled();
    expect(target.deferReply).toHaveBeenCalledWith();
    expect(mocks.refreshIfStale).toHaveBeenCalledWith("guild");
    const [, left, right] = mocks.versusCard.mock.calls[0]! as unknown as [
      unknown,
      { userId: string },
      { userId: string },
    ];
    expect([left.userId, right.userId]).toEqual(["alice", "caller"]);
    expect(target.editReply).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "versus.png" })],
      components: [],
    });
  });

  it("refuses the same player on both sides, privately", async () => {
    const target = await run("alice", "alice");

    expect(target.reply).toHaveBeenCalledWith({
      content: "versus.samePlayer",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    expect(target.deferReply).not.toHaveBeenCalled();
  });

  it("names the other player who has no linked account, privately", async () => {
    mocks.linked.delete("alice");

    const target = await run("alice", null);

    expect(target.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'versus.notRegistered {"user":"<@alice>"}',
        flags: MessageFlags.Ephemeral,
      })
    );
    expect(target.deferReply).not.toHaveBeenCalled();
    expect(mocks.versusCard).not.toHaveBeenCalled();
  });

  it.each([
    ["only the caller", ["caller"]],
    ["both players", ["caller", "alice"]],
  ])(
    "invites the caller to link their account when %s is unlinked",
    async (_label, unlinked) => {
      for (const userId of unlinked) {
        mocks.linked.delete(userId);
      }

      const target = await run("alice", null);

      expect(target.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "versus.notRegisteredSelf",
          flags: MessageFlags.Ephemeral,
        })
      );
      expect(target.deferReply).not.toHaveBeenCalled();
      expect(mocks.versusCard).not.toHaveBeenCalled();
    }
  );

  it("says so when neither player has a roll yet", async () => {
    mocks.versusCard.mockResolvedValueOnce(null);

    const target = await run("alice", "bob");

    expect(target.editReply).toHaveBeenCalledWith({
      content: "versus.noRolls",
    });
  });
});
