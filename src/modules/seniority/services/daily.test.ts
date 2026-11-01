import { Collection, type Client, type GuildMember } from "discord.js";
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

const { memberAnniversaries, runGuildDay } = await import("./daily.js");

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
    members: { fetch: vi.fn(async () => members) },
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
          { content: string; allowedMentions: { users: string[] } },
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
});

describe("memberAnniversaries", () => {
  it("skips bots and members of less than a year", () => {
    const { members } = setup();
    expect(
      memberAnniversaries(
        members.values(),
        { year: 2026, month: 10, day: 16 },
        "Europe/Paris"
      )
    ).toEqual([
      { userId: "alice", years: 3 },
      { userId: "bob", years: 1 },
      { userId: "quiet", years: 1 },
    ]);
  });
});

describe("runGuildDay", () => {
  it("posts the member anniversaries, then the server's", async () => {
    const { client, send } = setup();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);

    const messages = sent(send);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.content).toContain(
      "<@alice> est parmi nous depuis **3 ans**"
    );
    expect(messages[0]!.content).not.toContain("recent");
    expect(messages[0]!.allowedMentions.users).toEqual(["alice", "bob"]);
    expect(messages[1]!.content).toContain("Le serveur fête ses 5 ans");
    expect(state.claimDay).toHaveBeenCalledWith("guild-1", "2026-10-16");
  });

  it("can announce one without the other", async () => {
    const { client, send, guild } = setup({ memberAnniversaries: false });
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(guild.members.fetch).not.toHaveBeenCalled();
    expect(sent(send).map(({ content }) => content)).toEqual([
      "🎂 **Le serveur fête ses 5 ans aujourd'hui !**\n5 membres",
    ]);
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
