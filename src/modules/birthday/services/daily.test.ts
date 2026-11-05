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
import {
  birthdayConfigSchema,
  type BirthdayConfigSchema,
} from "../birthday.config.js";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };

const service = vi.hoisted(() => ({
  claimDay: vi.fn(),
  getState: vi.fn(),
  list: vi.fn(),
  removeMany: vi.fn(),
}));
vi.mock("./birthday.service.js", () => ({ default: service }));

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

const renderCelebrationCard = vi.hoisted(() => vi.fn());
vi.mock("#lib/celebration-card.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/celebration-card.js")>()),
  renderCelebrationCard,
}));
const renderBirthdayCalendar = vi.hoisted(() => vi.fn());
vi.mock("../rendering/birthday-calendar.js", () => ({
  renderBirthdayCalendar,
  shownAvatars: (count: number) => count,
}));
vi.mock("#lib/imaging.js", () => ({ fetchAvatar: async () => null }));

const { announcedCelebrants, runGuildDay } = await import("./daily.js");

const module = { id: "birthday" } as unknown as Module<BirthdayConfigSchema>;

function member(id: string, joinedAt: string, bot = false) {
  return {
    id,
    displayName: id,
    joinedAt: new Date(joinedAt),
    user: { bot },
    roles: {
      cache: new Collection<string, unknown>(),
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
  } as unknown as GuildMember;
}

function setup(values: Partial<ConfigData<BirthdayConfigSchema>> = {}) {
  const send = vi.fn(async () => ({}));
  const channel = { id: "chan", isSendable: () => true, send };
  const config = makeTestConfig(
    "birthday",
    birthdayConfigSchema,
    { channel, ...values } as Partial<ConfigData<BirthdayConfigSchema>>,
    "fr"
  );
  getConfigForModuleIn.mockResolvedValue(config);
  const members = new Collection<string, GuildMember>([
    ["alice", member("alice", "2023-10-16T08:00:00Z")],
    ["bob", member("bob", "2025-10-16T08:00:00Z")],
    ["quiet", member("quiet", "2026-01-01T08:00:00Z")],
    ["bot", member("bot", "2020-10-16T08:00:00Z", true)],
  ]);
  const guild = {
    id: "guild-1",
    createdAt: new Date("2021-10-16T10:00:00Z"),
    memberCount: 4,
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

// 16 October 2026, 09:00 in Paris.
const NINE_IN_PARIS = new Date("2026-10-16T07:00:00Z");

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("birthday", { en, fr });
});

beforeEach(() => {
  vi.clearAllMocks();
  renderCelebrationCard.mockReturnValue(Buffer.from("png"));
  renderBirthdayCalendar.mockReturnValue(Buffer.from("calendar"));
  service.claimDay.mockResolvedValue(true);
  service.getState.mockResolvedValue({
    lastDay: "2026-10-15",
    milestones: [],
    firstCollisionCount: null,
  });
  service.list.mockResolvedValue([
    { userId: "alice", day: 16, month: 10, announce: true },
    { userId: "quiet", day: 16, month: 10, announce: false },
    { userId: "bob", day: 1, month: 1, announce: true },
    { userId: "gone", day: 16, month: 10, announce: true },
  ]);
});

describe("announcedCelebrants", () => {
  it("leaves out the members who did not want to be announced", () => {
    expect(
      announcedCelebrants(
        [
          { userId: "a", day: 16, month: 10, announce: true },
          { userId: "b", day: 16, month: 10, announce: false },
          { userId: "c", day: 17, month: 10, announce: true },
        ],
        { year: 2026, month: 10, day: 16 }
      )
    ).toEqual(["a"]);
  });
});

describe("runGuildDay", () => {
  it("waits for the announcement hour", async () => {
    const { client, send } = setup({ hour: 10 });
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(service.claimDay).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("runs once per local day", async () => {
    service.claimDay.mockResolvedValue(false);
    const { client, send } = setup();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(service.claimDay).toHaveBeenCalledWith("guild-1", "2026-10-16");
    expect(send).not.toHaveBeenCalled();
  });

  it("purges departed members, then wishes today's birthdays", async () => {
    const { client, send } = setup({ messages: ["Bravo {user} !"] });
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);

    expect(service.removeMany).toHaveBeenCalledWith("guild-1", ["gone"]);
    expect(send).toHaveBeenCalledTimes(1);
    const [{ content, files }] = send.mock.calls[0] as unknown as [
      { content: string; files: { description: string }[] },
    ];
    expect(content).toBe("🎂 Joyeux anniversaire <@alice> !");
    expect(renderCelebrationCard).toHaveBeenCalledWith(
      expect.objectContaining({
        names: "alice",
        avatars: [null],
        quote: expect.objectContaining({ text: "Bravo alice !" }),
      })
    );
    expect(files[0]!.description).toContain("« Bravo alice ! »");
  });

  it("falls back to the text wish when the card cannot be drawn", async () => {
    renderCelebrationCard.mockImplementation(() => {
      throw new Error("no canvas");
    });
    const { client, send } = setup({ messages: ["Bravo {user} !"] });
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(send).toHaveBeenCalledWith({
      content: "Bravo <@alice> !",
      allowedMentions: { users: ["alice"] },
    });
  });

  it("falls back to the text wish when Discord refuses the card", async () => {
    const { client, send } = setup();
    send.mockRejectedValueOnce(
      new DiscordAPIError(
        { code: 50013, message: "Missing Permissions" },
        50013,
        403,
        "POST",
        "/channels/chan/messages",
        {}
      )
    );
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({
      content: expect.stringContaining("<@alice>"),
      allowedMentions: { users: ["alice"] },
    });
  });

  it("only mentions the members who accept it", async () => {
    service.list.mockResolvedValue([
      { userId: "quiet", day: 16, month: 10, announce: true },
    ]);
    const { client, send } = setup();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { users: [] } })
    );
  });

  it("moves the birthday role to today's announced celebrants", async () => {
    const { client, members } = setup();
    const yesterday = members.get("bob")!;
    const role = {
      id: "role",
      members: new Collection([["bob", yesterday]]),
    };
    getConfigForModuleIn.mockResolvedValue(
      makeTestConfig(
        "birthday",
        birthdayConfigSchema,
        {
          channel: { isSendable: () => false },
          role,
        } as unknown as Partial<ConfigData<BirthdayConfigSchema>>,
        "fr"
      )
    );
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(yesterday.roles.remove).toHaveBeenCalledWith(role);
    expect(members.get("alice")!.roles.add).toHaveBeenCalledWith(role);
    expect(members.get("quiet")!.roles.add).not.toHaveBeenCalled();
  });

  it("keeps moving the role when Discord refuses one change", async () => {
    const { client, members } = setup();
    const yesterday = members.get("bob")!;
    vi.mocked(yesterday.roles.remove).mockRejectedValue(new Error("refused"));
    const role = { id: "role", members: new Collection([["bob", yesterday]]) };
    getConfigForModuleIn.mockResolvedValue(
      makeTestConfig(
        "birthday",
        birthdayConfigSchema,
        {
          channel: { isSendable: () => false },
          role,
        } as unknown as Partial<ConfigData<BirthdayConfigSchema>>,
        "fr"
      )
    );
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(members.get("alice")!.roles.add).toHaveBeenCalledWith(role);
  });

  it("leaves the day unclaimed when the members cannot be fetched", async () => {
    const { client, guild, send } = setup();
    guild.members.fetch.mockRejectedValue(new Error("timeout"));
    await expect(
      runGuildDay(client, module, "guild-1", NINE_IN_PARIS)
    ).rejects.toThrow("timeout");
    expect(service.claimDay).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("never goes back to a day already announced", async () => {
    service.getState.mockResolvedValue({
      lastDay: "2026-10-17",
      milestones: [],
      firstCollisionCount: null,
    });
    const { client, guild, send } = setup();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(guild.members.fetch).not.toHaveBeenCalled();
    expect(service.claimDay).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("skips a guild the bot left", async () => {
    const { client, send } = setup();
    client.guilds.cache.clear();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(getConfigForModuleIn).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("monthly calendar", () => {
  // 1 November 2026, 09:00 in Paris.
  const FIRST_IN_PARIS = new Date("2026-11-01T08:00:00Z");

  beforeEach(() => {
    service.getState.mockResolvedValue({
      lastDay: "2026-10-31",
      milestones: [],
      firstCollisionCount: null,
    });
    service.list.mockResolvedValue([
      { userId: "alice", day: 1, month: 11, announce: true },
      { userId: "quiet", day: 1, month: 11, announce: false },
      { userId: "bob", day: 20, month: 11, announce: true },
      { userId: "gone", day: 5, month: 11, announce: true },
    ]);
  });

  type Sent = {
    content: string;
    files: { name: string; description: string }[];
    allowedMentions: unknown;
  };
  const calendarPost = (send: ReturnType<typeof setup>["send"]) =>
    (send.mock.calls as unknown as [Sent][])
      .map(([options]) => options)
      .find((options) => options.files?.[0]?.name === "birthday-calendar.png");

  it("is posted on the 1st after the wishes, without hidden or departed members", async () => {
    const { client, send } = setup();
    await runGuildDay(client, module, "guild-1", FIRST_IN_PARIS);

    expect(send).toHaveBeenCalledTimes(2);
    const [{ days }] = renderBirthdayCalendar.mock.calls[0] as [
      { days: { name: string }[][] },
    ];
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual([{ name: "alice", avatar: null }]);
    expect(days[19]).toEqual([{ name: "bob", avatar: null }]);
    expect(days.flat()).toHaveLength(2);
    const post = calendarPost(send)!;
    expect(send.mock.calls.at(-1)![0]).toBe(post);
    expect(post.content).not.toMatch(/<@/);
    expect(post.allowedMentions).toEqual({ parse: [] });
    expect(post.files[0]!.description).not.toMatch(/quiet|gone/);
  });

  it("is only posted on the 1st", async () => {
    const { client, send } = setup();
    await runGuildDay(client, module, "guild-1", NINE_IN_PARIS);
    expect(renderBirthdayCalendar).not.toHaveBeenCalled();
    expect(calendarPost(send)).toBeUndefined();
  });

  it("is not posted when disabled, nor when nobody is shown", async () => {
    const { client, send } = setup({ monthlyCalendar: false });
    await runGuildDay(client, module, "guild-1", FIRST_IN_PARIS);
    expect(calendarPost(send)).toBeUndefined();

    service.list.mockResolvedValue([
      { userId: "quiet", day: 3, month: 11, announce: false },
      { userId: "gone", day: 5, month: 11, announce: true },
    ]);
    const other = setup();
    await runGuildDay(other.client, module, "guild-1", FIRST_IN_PARIS);
    expect(other.send).not.toHaveBeenCalled();
  });

  it("does not disturb the wishes when it cannot be drawn or sent", async () => {
    renderBirthdayCalendar.mockImplementation(() => {
      throw new Error("no canvas");
    });
    const { client, send } = setup();
    await expect(
      runGuildDay(client, module, "guild-1", FIRST_IN_PARIS)
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: "🎂 Joyeux anniversaire <@alice> !" })
    );

    renderBirthdayCalendar.mockReturnValue(Buffer.from("calendar"));
    const other = setup();
    other.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("refused"));
    await expect(
      runGuildDay(other.client, module, "guild-1", FIRST_IN_PARIS)
    ).resolves.toBeUndefined();
    expect(other.send).toHaveBeenCalledTimes(2);
  });

  it("is still posted when the wishes fail", async () => {
    renderCelebrationCard.mockReturnValue(Buffer.from("png"));
    const { client, send } = setup();
    send.mockRejectedValueOnce(new Error("network"));
    await runGuildDay(client, module, "guild-1", FIRST_IN_PARIS);
    expect(calendarPost(send)).toBeDefined();
  });
});
