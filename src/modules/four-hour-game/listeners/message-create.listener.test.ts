import { MessageFlags, type EmbedBuilder, type Message } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import { initTestI18n, makeTestConfig, silenceLogs } from "#lib/testing.js";
import {
  fourHourGameConfigSchema,
  type FourHourGameConfigSchema,
} from "#modules/four-hour-game/four-hour-game.config.js";
import en from "#modules/four-hour-game/i18n/en.json" with { type: "json" };
import fr from "#modules/four-hour-game/i18n/fr.json" with { type: "json" };

const handleMessage = vi.hoisted(() => vi.fn());
const getRank = vi.hoisted(() => vi.fn());
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: { handleMessage, getRank },
}));

const { default: listener, buildPointEmbed } =
  await import("./message-create.listener.js");

beforeAll(async () => {
  silenceLogs();
  await initTestI18n("four-hour-game", { en, fr });
});

const GAME_CHANNEL = "game-channel";

function fakeConfig(
  values: { channel?: { id: string } | null; delay?: number | null } = {}
) {
  const data = { channel: { id: GAME_CHANNEL }, delay: 30, ...values };
  return {
    get: (key: "channel" | "delay") => data[key],
    t: (key: string) => key,
  } as unknown as ConfigProvider<FourHourGameConfigSchema>;
}

const memberFetch = vi.fn();
const userFetch = vi.fn();

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    guild: {
      members: { fetch: memberFetch },
      client: { users: { fetch: userFetch } },
    },
    id: "message-1",
    guildId: "guild-1",
    channelId: GAME_CHANNEL,
    createdAt: new Date("2026-10-02T10:00:00Z"),
    author: { id: "alice", bot: false },
    system: false,
    inGuild: () => true,
    channel: { send: vi.fn() },
    ...overrides,
  } as unknown as Message;
}

beforeEach(() => {
  handleMessage.mockReset();
  handleMessage.mockResolvedValue({ kind: "first" });
  getRank.mockReset();
  getRank.mockResolvedValue({ rank: 3, total: 17 });
  memberFetch.mockReset();
  memberFetch.mockResolvedValue({
    displayAvatarURL: () => "https://cdn/member.png",
  });
  userFetch.mockReset();
  userFetch.mockResolvedValue({
    displayAvatarURL: () => "https://cdn/user.png",
  });
});

const heldSince = new Date("2026-10-02T05:48:00Z");

function pointResult() {
  return {
    kind: "point",
    winnerId: "bob",
    score: 42,
    heldSeconds: 4 * 3600 + 12 * 60,
    heldSince,
  };
}

function sentEmbed(message: Message) {
  const send = vi.mocked(message.channel.send);
  const [args] = send.mock.calls[0] as [{ embeds: EmbedBuilder[] }];
  return args.embeds[0]!.toJSON();
}

describe("four-hour-game messageCreate listener", () => {
  it("hands a player's message in the game channel to the game", async () => {
    await listener.execute(fakeMessage(), fakeConfig());

    expect(handleMessage).toHaveBeenCalledWith(
      {
        guildId: "guild-1",
        channelId: GAME_CHANNEL,
        messageId: "message-1",
        authorId: "alice",
        sentAt: new Date("2026-10-02T10:00:00Z"),
      },
      30
    );
  });

  it.each([
    ["a bot message", { author: { id: "bot", bot: true } }],
    ["a system message", { system: true }],
    ["a direct message", { inGuild: () => false }],
    ["a message in another channel", { channelId: "elsewhere" }],
  ])("ignores %s", async (_label, overrides) => {
    await listener.execute(fakeMessage(overrides), fakeConfig());

    expect(handleMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["no game channel is configured", { channel: null }],
    ["the delay is missing", { delay: null }],
  ])("does nothing when %s", async (_label, values) => {
    await listener.execute(fakeMessage(), fakeConfig(values));

    expect(handleMessage).not.toHaveBeenCalled();
  });

  it("announces a point in the channel without pinging anyone", async () => {
    handleMessage.mockResolvedValue(pointResult());
    const message = fakeMessage();

    await listener.execute(message, fakeConfig());

    expect(message.channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedMentions: { parse: [] },
        flags: MessageFlags.SuppressNotifications,
      })
    );
    expect(getRank).toHaveBeenCalledWith("guild-1", "bob");
    expect(memberFetch).toHaveBeenCalledWith("bob");
    expect(sentEmbed(message).thumbnail?.url).toBe("https://cdn/member.png");
  });

  it("falls back to the user's avatar when the winner left the server", async () => {
    handleMessage.mockResolvedValue(pointResult());
    memberFetch.mockRejectedValue(new Error("Unknown Member"));
    const message = fakeMessage();

    await listener.execute(message, fakeConfig());

    expect(sentEmbed(message).thumbnail?.url).toBe("https://cdn/user.png");
  });

  it("still announces the point when the rank and avatar are unavailable", async () => {
    handleMessage.mockResolvedValue(pointResult());
    getRank.mockRejectedValue(new Error("database unavailable"));
    memberFetch.mockRejectedValue(new Error("Unknown Member"));
    userFetch.mockRejectedValue(new Error("Unknown User"));
    const message = fakeMessage();

    await listener.execute(message, fakeConfig());

    const embed = sentEmbed(message);
    expect(embed.thumbnail).toBeUndefined();
    expect(embed.description).toBe("point.description\npoint.total");
  });
});

describe("buildPointEmbed", () => {
  const announcement = {
    winnerId: "bob",
    score: 42,
    heldSeconds: 4 * 3600 + 12 * 60 + 5,
    heldSince,
    rank: { rank: 3, total: 17 },
    avatarUrl: "https://cdn/bob.png",
  };
  const config = (locale: string) =>
    makeTestConfig("four-hour-game", fourHourGameConfigSchema, {}, locale);

  it("tells how long the message held, the new total and the rank", () => {
    const embed = buildPointEmbed(announcement, config("fr")).toJSON();

    expect(embed.title).toBe("Point gagné !");
    expect(embed.description).toBe(
      "<@bob> marque un point ! Son message est resté sans réponse pendant **4 h 12 min**.\n" +
        "Total : **42 points** · 3ᵉ sur 17"
    );
    expect(embed.thumbnail?.url).toBe("https://cdn/bob.png");
    expect(embed.footer?.text).toBe("Message posté");
    expect(embed.timestamp).toBe(heldSince.toISOString());
  });

  it("sends the whole announcement, in green", () => {
    expect(buildPointEmbed(announcement, config("fr")).toJSON()).toEqual({
      title: "Point gagné !",
      description:
        "<@bob> marque un point ! Son message est resté sans réponse pendant **4 h 12 min**.\n" +
        "Total : **42 points** · 3ᵉ sur 17",
      color: 0x00ff00,
      thumbnail: { url: "https://cdn/bob.png" },
      footer: { text: "Message posté" },
      timestamp: heldSince.toISOString(),
    });
  });

  it("speaks English and handles a first point", () => {
    const embed = buildPointEmbed(
      { ...announcement, score: 1, rank: { rank: 1, total: 1 } },
      config("en")
    ).toJSON();

    expect(embed.description).toBe(
      "<@bob> scores a point! Their message went unanswered for **4h 12m**.\n" +
        "Total: **1 point** · 1st of 1"
    );
  });

  it("leaves out the rank and thumbnail when they are unknown", () => {
    const embed = buildPointEmbed(
      { ...announcement, rank: null, avatarUrl: null },
      config("fr")
    ).toJSON();

    expect(embed.description).toMatch(/\nTotal : \*\*42 points\*\*$/);
    expect(embed.thumbnail).toBeUndefined();
  });
});
