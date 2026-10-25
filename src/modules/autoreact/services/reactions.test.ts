import { ChannelType, type Guild, type PermissionsString } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  set: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
}));

vi.mock("#modules/autoreact/services/store.js", () => ({ default: store }));

const { parseEmoji, reactionRecords } = await import("./reactions.js");

const hype = { id: "111111111111111111", name: "hype", animated: false };

interface FakeOptions {
  guildEmojis?: (typeof hype)[];
  clientEmojiIds?: string[];
  granted?: PermissionsString[];
  channelIds?: string[];
  channelType?: ChannelType;
}

function fakeGuild(options: FakeOptions = {}) {
  const granted = options.granted ?? [
    "ViewChannel",
    "ReadMessageHistory",
    "AddReactions",
  ];
  const channel = (id: string) => ({
    id,
    type: options.channelType ?? ChannelType.GuildText,
    permissionsFor: () => ({
      missing: (required: PermissionsString[]) =>
        required.filter((permission) => !granted.includes(permission)),
    }),
  });
  return {
    id: "g1",
    client: {
      emojis: {
        resolve: (id: string) =>
          (options.clientEmojiIds ?? []).includes(id) ? {} : null,
      },
    },
    emojis: {
      fetch: async () =>
        new Map((options.guildEmojis ?? []).map((e) => [e.id, e])),
    },
    members: { me: {}, fetchMe: vi.fn() },
    channels: {
      cache: new Map(
        (options.channelIds ?? ["c1"]).map((id) => [id, channel(id)])
      ),
    },
  } as unknown as Guild;
}

const context = {
  t: (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
  userId: "admin",
};

beforeEach(() => {
  vi.clearAllMocks();
  store.remove.mockResolvedValue(1);
  store.list.mockResolvedValue([]);
});

describe("parseEmoji", () => {
  it("accepts a Unicode emoji", async () => {
    expect(await parseEmoji(fakeGuild(), " 👍 ")).toBe("👍");
  });

  it("resolves a fetched guild emoji by name", async () => {
    const guild = fakeGuild({ guildEmojis: [hype] });
    expect(await parseEmoji(guild, "hype")).toBe(`<:hype:${hype.id}>`);
  });

  it("accepts a guild emoji missing from the client cache", async () => {
    const guild = fakeGuild({ guildEmojis: [hype] });
    expect(await parseEmoji(guild, `<:hype:${hype.id}>`)).toBe(
      `<:hype:${hype.id}>`
    );
  });

  it("accepts an emoji from another server the bot is in", async () => {
    const id = "222222222222222222";
    const guild = fakeGuild({ clientEmojiIds: [id] });
    expect(await parseEmoji(guild, `<:other:${id}>`)).toBe(`<:other:${id}>`);
  });

  it("rejects a custom emoji the bot cannot use", async () => {
    expect(
      await parseEmoji(fakeGuild(), "<:other:333333333333333333>")
    ).toBeNull();
  });

  it("rejects text that is not an emoji", async () => {
    expect(await parseEmoji(fakeGuild(), "hello world")).toBeNull();
  });
});

describe("reactionRecords", () => {
  it("lists each reaction as a channel record", async () => {
    store.list.mockResolvedValue([{ channelId: "c1", emoji: "👍" }]);
    expect(await reactionRecords.list("g1")).toEqual([
      { channelId: "c1", values: { emoji: "👍" } },
    ]);
  });

  it("saves a reaction through the same checks as the command", async () => {
    const outcome = await reactionRecords.save(
      fakeGuild(),
      { channelId: "c1", values: { emoji: "👍" } },
      context
    );
    expect(outcome.ok).toBe(true);
    expect(store.set).toHaveBeenCalledWith("g1", "c1", "👍");
  });

  it("refuses a channel where the bot cannot react", async () => {
    const outcome = await reactionRecords.save(
      fakeGuild({ granted: ["ViewChannel"] }),
      { channelId: "c1", values: { emoji: "👍" } },
      context
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("set.missingPermissions");
    expect(store.set).not.toHaveBeenCalled();
  });

  it("refuses a channel that is not a text or announcement channel", async () => {
    const outcome = await reactionRecords.save(
      fakeGuild({ channelType: ChannelType.GuildVoice }),
      { channelId: "c1", values: { emoji: "👍" } },
      context
    );
    expect(outcome).toEqual({ ok: false, message: "set.unknownChannel" });
    expect(store.set).not.toHaveBeenCalled();
  });

  it("refuses a channel that no longer exists", async () => {
    const outcome = await reactionRecords.save(
      fakeGuild(),
      { channelId: "gone", values: { emoji: "👍" } },
      context
    );
    expect(outcome).toEqual({ ok: false, message: "set.unknownChannel" });
    expect(store.set).not.toHaveBeenCalled();
  });

  it("removes a reaction and reports when there was none", async () => {
    expect((await reactionRecords.remove(fakeGuild(), "c1", context)).ok).toBe(
      true
    );
    expect(store.remove).toHaveBeenCalledWith("g1", "c1");
    store.remove.mockResolvedValue(0);
    const outcome = await reactionRecords.remove(fakeGuild(), "c1", context);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("remove.none");
  });
});
