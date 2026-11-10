import {
  Collection,
  DiscordAPIError,
  type Client,
  type GuildMember,
} from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigData } from "#lib/config.js";
import type { Module } from "#lib/module.js";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  seniorityConfigSchema,
  type SeniorityConfigSchema,
} from "../seniority.config.js";

const state = vi.hoisted(() => ({ lastDay: vi.fn(), claimDay: vi.fn() }));
vi.mock("./state.js", () => state);
const recomputed = vi.hoisted(() => ({
  overrides: vi.fn(async () => new Map<string, Date>()),
}));
vi.mock("./overrides.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./overrides.js")>()),
  ...recomputed,
}));

const getConfigForModuleIn = vi.hoisted(() => vi.fn());
vi.mock("#core/services/config.service.js", () => ({
  default: { getConfigForModuleIn },
}));
vi.mock("#core/services/module.service.js", () => ({
  default: { getActivatedGuildIds: async () => ["guild-1"] },
}));
vi.mock("#core/services/mention.service.js", () => ({
  default: {
    mentionable: async (_guildId: string, ids: string[]) =>
      ids.filter((id) => id !== "quiet"),
  },
}));

const cards = vi.hoisted(() => ({
  seniorityCard: vi.fn(),
  serverCard: vi.fn(),
}));
vi.mock("./cards.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cards.js")>()),
  ...cards,
}));

const { runGuildDay } = await import("./daily.js");

const module = { id: "seniority" } as unknown as Module<SeniorityConfigSchema>;

function member(id: string, joinedAt: string, bot = false) {
  return { id, joinedAt: new Date(joinedAt), user: { bot } } as GuildMember;
}

function setup(values: Partial<ConfigData<SeniorityConfigSchema>> = {}) {
  const send = vi.fn(async () => ({}));
  const channel = { id: "chan", isSendable: () => true, send };
  getConfigForModuleIn.mockResolvedValue(
    makeTestConfig(
      "seniority",
      seniorityConfigSchema,
      { channel, ...values } as Partial<ConfigData<SeniorityConfigSchema>>,
      "fr"
    )
  );
  const members = new Collection<string, GuildMember>([
    ["alice", member("alice", "2023-10-16T08:00:00Z")],
    ["bob", member("bob", "2025-10-16T08:00:00Z")],
    ["quiet", member("quiet", "2025-10-16T08:00:00Z")],
    ["recent", member("recent", "2026-01-01T08:00:00Z")],
    ["bot", member("bot", "2020-10-16T08:00:00Z", true)],
  ]);
  const guild = {
    id: "guild-1",
    createdAt: new Date("2021-10-16T10:00:00Z"),
    memberCount: 5,
    members: { cache: members, fetch: vi.fn(async () => members) },
  };
  const client = {
    guilds: {
      cache: new Collection([["guild-1", guild]]),
      fetch: vi.fn(async () => guild),
    },
  } as unknown as Client<true>;
  return { client, send, members, guild };
}

function sent(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls.map(
    (call) =>
      (
        call as unknown as [
          {
            content: string;
            files?: unknown[];
            components?: unknown[];
            allowedMentions: { users: string[] };
          },
        ]
      )[0]
  );
}

// 16 October 2026, 09:00 in Paris.
const NINE_IN_PARIS = new Date("2026-10-16T07:00:00Z");

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("seniority", { en, fr });
});

beforeEach(() => {
  vi.clearAllMocks();
  state.lastDay.mockResolvedValue("2026-10-15");
  state.claimDay.mockResolvedValue(undefined);
  cards.seniorityCard.mockResolvedValue("members.png");
  cards.serverCard.mockResolvedValue("server.png");
});

describe("runGuildDay", () => {
  it("puts a recomputed member under the years of their first message", async () => {
    // Bob's first message is from 2020: six years, not one.
    recomputed.overrides.mockResolvedValueOnce(
      new Map([["bob", new Date("2020-10-16T08:00:00Z")]])
    );
    const { client, send } = setup({ serverAnniversary: false });
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    const [first] = sent(send);
    expect(first!.content).toBe(
      "🎉 **Ancienneté sur le serveur**\n**6 ans**\n<@bob>\n**3 ans**\n<@alice>\n**1 an**\n<@quiet>"
    );
  });

  it("posts the member anniversaries, then the server's", async () => {
    const { client, send } = setup();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);

    const messages = sent(send);
    expect(messages).toEqual([
      {
        content:
          "🎉 **Ancienneté sur le serveur**\n**3 ans**\n<@alice>\n**1 an**\n<@bob> <@quiet>",
        files: ["members.png"],
        allowedMentions: { users: ["alice", "bob"] },
      },
      {
        content: "🎂 Le serveur fête ses 5 ans !",
        files: ["server.png"],
        allowedMentions: { users: [] },
      },
    ]);
    // The members celebrated today, longest-standing first.
    const [, celebrated, day] = cards.seniorityCard.mock.calls[0]!;
    expect(
      (celebrated as { member: GuildMember }[]).map(({ member }) => member.id)
    ).toEqual(["alice", "bob", "quiet"]);
    expect(day).toMatchObject({ year: 2026, month: 10, day: 16 });
    expect(state.claimDay).toHaveBeenCalledWith("guild-1", "2026-10-16");
  });

  it("falls back to the text announcements when a card cannot be drawn", async () => {
    const { client, send } = setup();
    cards.seniorityCard.mockRejectedValue(new Error("canvas"));
    cards.serverCard.mockRejectedValue(new Error("canvas"));
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);

    expect(sent(send)).toEqual([
      {
        content:
          "🎉 **Ancienneté sur le serveur**\n**3 ans**\n<@alice>\n**1 an**\n<@bob> <@quiet>",
        allowedMentions: { users: ["alice", "bob"] },
      },
      {
        content: "🎂 **Le serveur fête ses 5 ans aujourd'hui !**\n5 membres",
        allowedMentions: { users: [] },
      },
    ]);
  });

  it("falls back to the text announcements when Discord refuses the images", async () => {
    const { client, send } = setup();
    const refused = new DiscordAPIError(
      { code: 50013, message: "Missing Permissions" },
      50013,
      403,
      "POST",
      "/channels/chan/messages",
      {}
    );
    // Refuses every message with an image, as without Attach Files.
    send.mockImplementation(async (message: { files?: unknown[] }) => {
      if (message.files) {
        throw refused;
      }
      return {};
    });
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);

    expect(sent(send).map(({ content }) => content)).toEqual([
      "🎉 **Ancienneté sur le serveur**\n**3 ans**\n<@alice>\n**1 an**\n<@bob> <@quiet>",
      "🎉 **Ancienneté sur le serveur**\n**3 ans**\n<@alice>\n**1 an**\n<@bob> <@quiet>",
      "🎂 Le serveur fête ses 5 ans !",
      "🎂 **Le serveur fête ses 5 ans aujourd'hui !**\n5 membres",
    ]);
  });

  it("can announce one without the other", async () => {
    const { client, send } = setup({ memberAnniversaries: false });
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(sent(send).map(({ content }) => content)).toEqual([
      "🎂 Le serveur fête ses 5 ans !",
    ]);
  });

  it("posts the server's anniversary in its own channel when one is set", async () => {
    const serverSend = vi.fn(async () => ({}));
    const serverChannel = {
      id: "party",
      isSendable: () => true,
      send: serverSend,
    };
    const { client, send } = setup({ serverChannel } as Partial<
      ConfigData<SeniorityConfigSchema>
    >);
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(sent(send).map(({ content }) => content)).toEqual([
      "🎉 **Ancienneté sur le serveur**\n**3 ans**\n<@alice>\n**1 an**\n<@bob> <@quiet>",
    ]);
    expect(sent(serverSend).map(({ content }) => content)).toEqual([
      "🎂 Le serveur fête ses 5 ans !",
    ]);
  });

  it("posts the server's anniversary in its own channel without an announcement channel", async () => {
    const serverSend = vi.fn(async () => ({}));
    const serverChannel = {
      id: "party",
      isSendable: () => true,
      send: serverSend,
    };
    const { client, send } = setup({ channel: null, serverChannel } as Partial<
      ConfigData<SeniorityConfigSchema>
    >);
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(send).not.toHaveBeenCalled();
    expect(sent(serverSend).map(({ content }) => content)).toEqual([
      "🎂 Le serveur fête ses 5 ans !",
    ]);
  });

  it("fetches no members for the member anniversaries without a channel to post them", async () => {
    const { client, guild } = setup({ channel: undefined } as Partial<
      ConfigData<SeniorityConfigSchema>
    >);
    await runGuildDay(
      client,
      module,
      "guild-1",
      new Date("2026-10-17T07:00:00Z")
    );
    expect(guild.members.fetch).not.toHaveBeenCalled();
    expect(cards.seniorityCard).not.toHaveBeenCalled();
  });

  it("fetches no members on the server's anniversary without a channel for anything", async () => {
    const { client, guild, send } = setup({ channel: undefined } as Partial<
      ConfigData<SeniorityConfigSchema>
    >);
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(guild.members.fetch).not.toHaveBeenCalled();
    expect(cards.serverCard).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("fetches no members when the bot cannot post in the channel", async () => {
    const { client, guild, send } = setup({
      channel: { id: "voice", isSendable: () => false, send: vi.fn() },
    } as unknown as Partial<ConfigData<SeniorityConfigSchema>>);
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(guild.members.fetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("fetches no members when there is nothing to announce", async () => {
    const { client, send, guild } = setup({ memberAnniversaries: false });
    await runGuildDay(
      client,
      module,
      "guild-1",
      new Date("2026-10-17T07:00:00Z")
    );
    expect(guild.members.fetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(state.claimDay).toHaveBeenCalledWith("guild-1", "2026-10-17");
  });

  it("runs once per local day", async () => {
    state.lastDay.mockResolvedValue("2026-10-16");
    const { client, send } = setup();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(state.claimDay).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves the day unclaimed when the members cannot be fetched", async () => {
    const { client, guild, send } = setup();
    guild.members.fetch.mockRejectedValue(new Error("timeout"));
    await expect(
      runGuildDay(client, module, "guild-1", NINE_IN_PARIS)
    ).rejects.toThrow("timeout");
    expect(state.claimDay).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("skips a guild the bot left", async () => {
    const { client, send } = setup();
    client.guilds.cache.clear();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(getConfigForModuleIn).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("still posts the server's anniversary when the members' fails", async () => {
    const { client, send } = setup();
    send.mockRejectedValueOnce(new Error("refused"));
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("allows in each message the mentions of its own members only", async () => {
    const { client, members, send } = setup({ serverAnniversary: false });
    for (let index = 0; index < 150; index++) {
      const id = `member-${index}`;
      members.set(id, member(id, "2024-10-16T08:00:00Z"));
    }
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);

    const messages = sent(send);
    expect(messages.length).toBeGreaterThan(1);
    // The image goes with the first message only.
    expect(messages.filter(({ files }) => files)).toHaveLength(1);
    expect(messages[0]!.files).toBeDefined();
    for (const { content, allowedMentions } of messages) {
      expect(allowedMentions.users.length).toBeLessThanOrEqual(100);
      for (const id of allowedMentions.users) {
        expect(content).toContain(`<@${id}>`);
      }
    }
    // The 150, alice and bob; "quiet" turned their mentions off.
    expect(
      messages.flatMap(({ allowedMentions }) => allowedMentions.users)
    ).toHaveLength(152);
  });
});
