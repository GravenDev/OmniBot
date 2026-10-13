import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  accountByUsername: vi.fn(),
  refreshIfStale: vi.fn(),
  linkOwnAccount: vi.fn(),
}));

vi.mock("#lib/logger.js", () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { loggerMaker: () => logger };
});
vi.mock("#modules/rngdle/services/store.js", () => ({
  default: {
    account: mocks.account,
    accountByUsername: mocks.accountByUsername,
  },
}));
vi.mock("#modules/rngdle/services/sync.js", () => ({
  default: { refreshIfStale: mocks.refreshIfStale },
}));
vi.mock("#modules/rngdle/services/linking.js", () => ({
  linkOwnAccount: mocks.linkOwnAccount,
}));
vi.mock("#modules/rngdle/services/views.js", () => ({}));
vi.mock("#modules/rngdle/interactions/overall-page.button.js", () => ({}));

const { default: command } = await import("./rngdle.command.js");

const config = {
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
} as unknown as ConfigProvider<RngdleConfigSchema>;

interface Options {
  subcommand: string;
  username?: string;
  member?: { id: string };
}

function interactionFor({ subcommand, username, member }: Options) {
  return {
    guildId: "guild",
    inGuild: () => true,
    user: { id: "caller" },
    options: {
      getSubcommand: () => subcommand,
      getString: (_name: string, required?: boolean) => {
        if (required && username === undefined) {
          throw new Error("missing option");
        }
        return username ?? null;
      },
      getUser: () => member ?? null,
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
}

async function run(interaction: ReturnType<typeof interactionFor>) {
  await command.execute(
    interaction as unknown as ChatInputCommandInteraction,
    config
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue(null);
  mocks.accountByUsername.mockResolvedValue(null);
});

describe("/rngdle link", () => {
  it("answers privately without the public defer or the stale refresh", async () => {
    mocks.linkOwnAccount.mockResolvedValue({ kind: "created", count: 3 });
    const interaction = interactionFor({
      subcommand: "link",
      username: "  Alice ",
    });
    await run(interaction);

    expect(interaction.deferReply).toHaveBeenCalledExactlyOnceWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(mocks.refreshIfStale).not.toHaveBeenCalled();
    expect(mocks.linkOwnAccount).toHaveBeenCalledWith(
      "guild",
      "caller",
      "Alice"
    );
    expect(interaction.editReply).toHaveBeenCalledWith(
      'link.created {"username":"Alice","count":3}'
    );
  });

  it("rejects a blank username before anything else", async () => {
    const interaction = interactionFor({ subcommand: "link", username: "   " });
    await run(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(mocks.linkOwnAccount).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral })
    );
  });

  it("refuses to replace another linked username", async () => {
    mocks.linkOwnAccount.mockResolvedValue({
      kind: "alreadyLinked",
      username: "Old",
    });
    const interaction = interactionFor({ subcommand: "link", username: "New" });
    await run(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      'link.alreadyLinked {"username":"Old"}'
    );
  });

  it("reports a username held by someone else without pinging them", async () => {
    mocks.linkOwnAccount.mockResolvedValue({
      kind: "conflict",
      userId: "holder",
    });
    const interaction = interactionFor({
      subcommand: "link",
      username: "Alice",
    });
    await run(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'link.conflict {"username":"Alice","user":"<@holder>"}',
      allowedMentions: { parse: [] },
    });
  });

  it.each(["unchanged", "notFound", "unreachable"] as const)(
    "reports the %s outcome",
    async (kind) => {
      mocks.linkOwnAccount.mockResolvedValue({ kind, count: 0 });
      const interaction = interactionFor({
        subcommand: "link",
        username: "Alice",
      });
      await run(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^link\\.${kind} `))
      );
    }
  );
});

describe("/rngdle unlink", () => {
  it("asks for a private confirmation bound to the caller", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "caller",
      username: "Alice",
    });
    const interaction = interactionFor({ subcommand: "unlink" });
    await run(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(mocks.refreshIfStale).not.toHaveBeenCalled();
    const [reply] = interaction.reply.mock.calls[0] as [
      {
        content: string;
        flags: number;
        components: { toJSON(): { components: { custom_id: string }[] } }[];
      },
    ];
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(reply.content).toBe('unlink.confirm {"username":"Alice"}');
    expect(
      reply.components[0]!.toJSON().components.map((c) => c.custom_id)
    ).toEqual([
      "rngdle-unlink:confirm:caller:2bd806c9",
      "rngdle-unlink:cancel:caller",
    ]);
  });

  it("says so when the caller has no linked account", async () => {
    const interaction = interactionFor({ subcommand: "unlink" });
    await run(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "unlink.none",
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("/rngdle profile without a linked account", () => {
  it.each([
    ["the caller", {}, "profile.notRegisteredSelf"],
    [
      "the caller picked as member",
      { member: { id: "caller" } },
      "profile.notRegisteredSelf",
    ],
    ["another member", { member: { id: "other" } }, "profile.notRegistered"],
    ["an RNGdle username", { username: "Bob" }, "profile.notRegistered"],
  ])("addresses %s", async (_label, options, key) => {
    const interaction = interactionFor({ subcommand: "profile", ...options });
    await run(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(interaction.editReply).toHaveBeenCalledWith(key);
  });
});
