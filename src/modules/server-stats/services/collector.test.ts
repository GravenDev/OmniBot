import {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  type GuildMember,
  type Message,
  type MessageReaction,
  type User,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { ServerStatsConfigSchema } from "#modules/server-stats/server-stats.config.js";

const store = vi.hoisted(() => ({
  recordMessage: vi.fn(async () => {}),
  recordReaction: vi.fn(async () => {}),
  recordMemberChange: vi.fn(async () => {}),
}));
vi.mock("./store.js", () => ({ default: store }));

const { collectMemberChange, collectMessage, collectReaction } =
  await import("./collector.js");

const everyone = { id: "everyone" };

function fakeChannel(options: { public?: boolean; thread?: boolean } = {}) {
  return {
    id: options.thread ? "thread" : "200",
    parentId: options.thread ? "200" : null,
    parent: options.thread ? { parentId: null } : null,
    type: options.thread ? ChannelType.PublicThread : ChannelType.GuildText,
    guild: { roles: { everyone } },
    isThread: () => options.thread ?? false,
    permissionsFor: () =>
      new PermissionsBitField(
        options.public === false ? [] : [PermissionFlagsBits.ViewChannel]
      ),
  };
}

const config = {
  get: (key: string) =>
    key === "excludedChannels" ? [] : key === "includePrivateChannels" && false,
} as unknown as ConfigProvider<ServerStatsConfigSchema>;

function fakeMessage(
  options: {
    bot?: boolean;
    system?: boolean;
    channel?: ReturnType<typeof fakeChannel>;
  } = {}
) {
  return {
    author: { id: "user-1", bot: options.bot ?? false },
    system: options.system ?? false,
    guildId: "guild-1",
    createdAt: new Date("2026-10-13T22:30:00Z"),
    channel: options.channel ?? fakeChannel(),
    inGuild: () => true,
  } as unknown as Message;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectMessage", () => {
  it("counts a member's message on the Paris day", async () => {
    await collectMessage(fakeMessage(), config);
    expect(store.recordMessage).toHaveBeenCalledWith(
      "guild-1",
      new Date("2026-10-14T00:00:00Z"),
      "200",
      "user-1"
    );
  });

  it("counts a thread message under its parent channel", async () => {
    await collectMessage(
      fakeMessage({ channel: fakeChannel({ thread: true }) }),
      config
    );
    expect(store.recordMessage).toHaveBeenCalledWith(
      "guild-1",
      expect.any(Date),
      "200",
      "user-1"
    );
  });

  it("ignores bots, system messages and private channels", async () => {
    await collectMessage(fakeMessage({ bot: true }), config);
    await collectMessage(fakeMessage({ system: true }), config);
    await collectMessage(
      fakeMessage({ channel: fakeChannel({ public: false }) }),
      config
    );
    expect(store.recordMessage).not.toHaveBeenCalled();
  });
});

describe("collectReaction", () => {
  const now = new Date("2026-10-13T12:00:00Z");

  function fakeReaction(channel = fakeChannel()) {
    return {
      emoji: { toString: () => "👍" },
      message: { guildId: "guild-1", channel, inGuild: () => true },
    } as unknown as MessageReaction;
  }

  it("counts a member's reaction", async () => {
    const user = { partial: false, bot: false } as unknown as User;
    await collectReaction(fakeReaction(), user, config, now);
    expect(store.recordReaction).toHaveBeenCalledWith(
      "guild-1",
      new Date("2026-10-13T00:00:00Z"),
      "👍"
    );
  });

  it("fetches a partial user to know whether it is a bot", async () => {
    const human = {
      partial: true,
      fetch: async () => ({ bot: false }),
    } as unknown as User;
    const bot = {
      partial: true,
      fetch: async () => ({ bot: true }),
    } as unknown as User;
    await collectReaction(fakeReaction(), bot, config, now);
    expect(store.recordReaction).not.toHaveBeenCalled();
    await collectReaction(fakeReaction(), human, config, now);
    expect(store.recordReaction).toHaveBeenCalledOnce();
  });

  it("ignores reactions in a private channel", async () => {
    const user = { partial: false, bot: false } as unknown as User;
    await collectReaction(
      fakeReaction(fakeChannel({ public: false })),
      user,
      config,
      now
    );
    expect(store.recordReaction).not.toHaveBeenCalled();
  });
});

describe("collectMemberChange", () => {
  const now = new Date("2026-10-13T12:00:00Z");

  it("counts humans joining or leaving", async () => {
    const member = {
      user: { bot: false },
      guild: { id: "guild-1" },
    } as unknown as GuildMember;
    await collectMemberChange(member, "leaves", now);
    expect(store.recordMemberChange).toHaveBeenCalledWith(
      "guild-1",
      new Date("2026-10-13T00:00:00Z"),
      "leaves"
    );
  });

  it("ignores bots", async () => {
    const bot = {
      user: { bot: true },
      guild: { id: "guild-1" },
    } as unknown as GuildMember;
    await collectMemberChange(bot, "joins", now);
    expect(store.recordMemberChange).not.toHaveBeenCalled();
  });
});
