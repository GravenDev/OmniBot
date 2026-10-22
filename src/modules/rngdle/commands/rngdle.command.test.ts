import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { RngdleConfigSchema } from "#modules/rngdle/rngdle.config.js";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  accountByUsername: vi.fn(),
  refreshIfStale: vi.fn(),
  linkOwnAccount: vi.fn(),
  dailyLeaderboard: vi.fn(),
  serverCard: vi.fn(),
  profileCard: vi.fn(),
  historyCard: vi.fn(),
  timelineCard: vi.fn(),
  trendCard: vi.fn(),
  overallPage: vi.fn(),
  setReminder: vi.fn(),
  setAnnouncements: vi.fn(),
  mentionable: vi.fn(),
}));

vi.mock("#lib/logger.js", () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { loggerMaker: () => logger };
});
vi.mock("#modules/rngdle/services/store.js", () => ({
  default: {
    account: mocks.account,
    accountByUsername: mocks.accountByUsername,
    setReminder: mocks.setReminder,
    setAnnouncements: mocks.setAnnouncements,
  },
}));
vi.mock("#core/services/mention.service.js", () => ({
  default: { mentionable: mocks.mentionable },
}));
vi.mock("#modules/rngdle/services/sync.js", () => ({
  default: { refreshIfStale: mocks.refreshIfStale },
}));
vi.mock("#modules/rngdle/services/linking.js", () => ({
  linkOwnAccount: mocks.linkOwnAccount,
}));
vi.mock("#modules/rngdle/services/views.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  dailyLeaderboard: mocks.dailyLeaderboard,
  serverCard: mocks.serverCard,
  profileCard: mocks.profileCard,
  historyCard: mocks.historyCard,
  timelineCard: mocks.timelineCard,
  trendCard: mocks.trendCard,
  overallPage: mocks.overallPage,
}));

const { default: command } = await import("./rngdle.command.js");

const config = {
  t: (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
  locale: "en",
  get: () => ({ id: "channel" }),
} as unknown as ConfigProvider<RngdleConfigSchema>;

interface Options {
  subcommand: string;
  username?: string;
  member?: { id: string };
  strings?: Record<string, string>;
  integers?: Record<string, number>;
  enabled?: boolean;
}

function interactionFor({
  subcommand,
  username,
  member,
  strings,
  integers,
  enabled,
}: Options) {
  return {
    guildId: "guild",
    guild: {},
    client: {},
    inGuild: () => true,
    user: { id: "caller" },
    options: {
      getSubcommand: () => subcommand,
      getString: (name: string, required?: boolean) => {
        const value = name === "username" ? username : strings?.[name];
        if (required && value === undefined) {
          throw new Error("missing option");
        }
        return value ?? null;
      },
      getUser: () => member ?? null,
      getInteger: (name: string) => integers?.[name] ?? null,
      getBoolean: () => enabled ?? null,
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
  mocks.dailyLeaderboard.mockResolvedValue({
    image: Buffer.from("png"),
    winnerIds: [],
  });
  mocks.serverCard.mockResolvedValue(Buffer.from("png"));
  mocks.profileCard.mockResolvedValue(Buffer.from("png"));
  mocks.historyCard.mockResolvedValue({
    image: Buffer.from("png"),
    page: 1,
    pageCount: 1,
  });
  mocks.timelineCard.mockResolvedValue(Buffer.from("png"));
  mocks.trendCard.mockResolvedValue(Buffer.from("png"));
  mocks.overallPage.mockResolvedValue({
    image: Buffer.from("png"),
    page: 1,
    pageCount: 1,
  });
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

describe("/rngdle remind", () => {
  it("asks an unlinked caller to link their account, privately", async () => {
    const interaction = interactionFor({ subcommand: "remind", enabled: true });
    await run(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(mocks.refreshIfStale).not.toHaveBeenCalled();
    expect(mocks.setReminder).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "remind.notRegistered",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("subscribes a linked caller and warns when their pings are off", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "caller",
      username: "Alice",
    });
    mocks.mentionable.mockResolvedValue([]);
    const interaction = interactionFor({ subcommand: "remind", enabled: true });
    await run(interaction);

    expect(mocks.setReminder).toHaveBeenCalledWith("guild", "caller", true);
    const [reply] = interaction.reply.mock.calls[0] as [
      { content: string; flags: number },
    ];
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(reply.content.split("\n")).toEqual([
      expect.stringMatching(/^remind\.enabled .*"channel":"<#channel>"/),
      "remind.pingsDisabled",
    ]);
  });

  it("turns the reminder off without needing a linked account", async () => {
    const interaction = interactionFor({
      subcommand: "remind",
      enabled: false,
    });
    await run(interaction);

    expect(mocks.setReminder).toHaveBeenCalledWith("guild", "caller", false);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "remind.disabled",
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe("/rngdle announce", () => {
  it("tells an unlinked caller that nothing will be posted yet", async () => {
    const interaction = interactionFor({
      subcommand: "announce",
      enabled: true,
    });
    await run(interaction);

    expect(mocks.setAnnouncements).toHaveBeenCalledWith(
      "guild",
      "caller",
      true
    );
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "announce.notRegistered",
      flags: MessageFlags.Ephemeral,
    });
  });

  it("confirms the channel to a linked caller", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "caller",
      username: "Alice",
    });
    const interaction = interactionFor({
      subcommand: "announce",
      enabled: true,
    });
    await run(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringMatching(/^announce\.enabled .*"<#channel>"/),
      flags: MessageFlags.Ephemeral,
    });
  });
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

describe("/rngdle history", () => {
  it.each([
    ["the caller", {}, "profile.notRegisteredSelf"],
    ["another member", { member: { id: "other" } }, "profile.notRegistered"],
    ["an RNGdle username", { username: "Bob" }, "profile.notRegistered"],
  ])("asks %s to link an account first", async (_label, options, key) => {
    const interaction = interactionFor({ subcommand: "history", ...options });
    await run(interaction);

    expect(mocks.historyCard).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({ content: key });
  });

  it("shows the looked-up player's history with the requested count", async () => {
    const account = { guildId: "guild", userId: "other", username: "Bob" };
    mocks.accountByUsername.mockResolvedValue(account);
    const interaction = interactionFor({
      subcommand: "history",
      username: "Bob",
      integers: { count: 15 },
    });
    await run(interaction);

    expect(mocks.accountByUsername).toHaveBeenCalledWith("guild", "Bob");
    expect(mocks.historyCard).toHaveBeenCalledWith(
      expect.anything(),
      account,
      15,
      expect.any(Date),
      1
    );
    const [sent] = interaction.editReply.mock.calls[0]! as [
      { files: { name: string }[] },
    ];
    expect(sent.files[0]!.name).toBe("history-Bob.png");
  });

  it("says so when the player has no roll yet", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "caller",
      username: "Lucky",
    });
    mocks.historyCard.mockResolvedValue(null);
    const interaction = interactionFor({ subcommand: "history" });
    await run(interaction);

    expect(mocks.historyCard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "caller" }),
      undefined,
      expect.any(Date),
      1
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'profile.noRolls {"username":"Lucky"}',
    });
  });
});

describe("/rngdle timeline", () => {
  it("asks the caller to link an account first", async () => {
    const interaction = interactionFor({ subcommand: "timeline" });
    await run(interaction);

    expect(mocks.timelineCard).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "profile.notRegisteredSelf",
    });
  });

  it("shows the looked-up player's timeline", async () => {
    const account = { guildId: "guild", userId: "other", username: "Bob" };
    mocks.accountByUsername.mockResolvedValue(account);
    const interaction = interactionFor({
      subcommand: "timeline",
      username: "Bob",
    });
    await run(interaction);

    expect(mocks.timelineCard).toHaveBeenCalledWith(expect.anything(), account);
    const [sent] = interaction.editReply.mock.calls[0]! as [
      { files: { name: string }[] },
    ];
    expect(sent.files[0]!.name).toBe("timeline-Bob.png");
  });
});

describe("/rngdle trend", () => {
  it("covers the requested number of days", async () => {
    const account = { guildId: "guild", userId: "other", username: "Bob" };
    mocks.accountByUsername.mockResolvedValue(account);
    const interaction = interactionFor({
      subcommand: "trend",
      username: "Bob",
      integers: { days: 365 },
    });
    await run(interaction);

    expect(mocks.trendCard).toHaveBeenCalledWith(
      expect.anything(),
      account,
      365
    );
    const [sent] = interaction.editReply.mock.calls[0]! as [
      { files: { name: string }[] },
    ];
    expect(sent.files[0]!.name).toBe("trend-Bob.png");
  });

  it("names the default period when the player has no roll in it", async () => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "caller",
      username: "Lucky",
    });
    mocks.trendCard.mockResolvedValue(null);
    const interaction = interactionFor({ subcommand: "trend" });
    await run(interaction);

    expect(mocks.trendCard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "caller" }),
      undefined
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'trend.noRolls {"username":"Lucky","count":90}',
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
    expect(interaction.editReply).toHaveBeenCalledWith({ content: key });
  });
});

async function reply(options: Options) {
  const interaction = interactionFor(options);
  await run(interaction);
  return interaction.editReply.mock.calls[0]![0] as {
    components?: { toJSON(): { components: { custom_id?: string }[] } }[];
  };
}

const customIds = (sent: Awaited<ReturnType<typeof reply>>) =>
  (sent.components ?? []).flatMap((row) =>
    row.toJSON().components.map((button) => button.custom_id)
  );

describe("/rngdle navigation buttons", () => {
  beforeEach(() => {
    mocks.account.mockResolvedValue({
      guildId: "guild",
      userId: "caller",
      username: "Lucky",
    });
  });

  it("offers the profile, the history and the overall leaderboard under today's leaderboard", async () => {
    expect(customIds(await reply({ subcommand: "leaderboard" }))).toEqual([
      "rngdle-nav:profile",
      "rngdle-nav:history",
      "rngdle-nav:overall",
    ]);
  });

  it("offers the profile, the history and the overall leaderboard under the server stats", async () => {
    expect(customIds(await reply({ subcommand: "server-stats" }))).toEqual([
      "rngdle-nav:profile",
      "rngdle-nav:history",
      "rngdle-nav:overall",
    ]);
  });

  it("offers the history, the trend, the timeline and the overall leaderboard under a profile", async () => {
    expect(customIds(await reply({ subcommand: "profile" }))).toEqual([
      "rngdle-nav:history",
      "rngdle-nav:trend",
      "rngdle-nav:timeline",
      "rngdle-nav:overall",
    ]);
  });

  it("offers the profile, the trend, the timeline and the overall leaderboard under a history", async () => {
    expect(customIds(await reply({ subcommand: "history" }))).toEqual([
      "rngdle-nav:profile",
      "rngdle-nav:trend",
      "rngdle-nav:timeline",
      "rngdle-nav:overall",
    ]);
  });

  it("pages a long history, keeping the player, the count and the day", async () => {
    mocks.historyCard.mockResolvedValue({
      image: Buffer.from("png"),
      page: 1,
      pageCount: 3,
    });
    const ids = customIds(
      await reply({ subcommand: "history", integers: { count: 15 } })
    );
    const day = Math.floor(Date.now() / 86_400_000);

    expect(ids.slice(0, 3)).toEqual([
      `rngdle-history:0:caller:15:public:${day}`,
      `rngdle-history:indicator:caller:15:public:${day}`,
      `rngdle-history:2:caller:15:public:${day}`,
    ]);
    expect(ids.slice(3)).toEqual([
      "rngdle-nav:profile",
      "rngdle-nav:trend",
      "rngdle-nav:timeline",
      "rngdle-nav:overall",
    ]);
  });

  it("offers the profile, the history and the trend under a timeline", async () => {
    expect(customIds(await reply({ subcommand: "timeline" }))).toEqual([
      "rngdle-nav:profile",
      "rngdle-nav:history",
      "rngdle-nav:trend",
    ]);
  });

  it("offers the profile, the history and the timeline under a trend", async () => {
    expect(customIds(await reply({ subcommand: "trend" }))).toEqual([
      "rngdle-nav:profile",
      "rngdle-nav:history",
      "rngdle-nav:timeline",
    ]);
  });
});

describe("/rngdle leaderboard-all", () => {
  it("ranks over the chosen period", async () => {
    await reply({
      subcommand: "leaderboard-all",
      strings: { period: "month" },
    });

    expect(mocks.overallPage).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "caller",
      "month",
      expect.any(Date)
    );
  });

  it("ranks over all time without a period", async () => {
    await reply({ subcommand: "leaderboard-all" });

    expect(mocks.overallPage).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "caller",
      "all",
      expect.any(Date)
    );
  });
});
