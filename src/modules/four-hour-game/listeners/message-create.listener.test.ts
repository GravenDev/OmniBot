import type { Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigProvider } from "#lib/config.js";
import type { FourHourGameConfigSchema } from "#modules/four-hour-game/four-hour-game.config.js";

const handleMessage = vi.hoisted(() => vi.fn());
vi.mock("#modules/four-hour-game/services/four-hour-game.service.js", () => ({
  default: { handleMessage },
}));

const { default: listener } = await import("./message-create.listener.js");

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

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
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
});

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
    handleMessage.mockResolvedValue({
      kind: "point",
      winnerId: "bob",
      score: 3,
    });
    const message = fakeMessage();

    await listener.execute(message, fakeConfig());

    expect(message.channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ allowedMentions: { parse: [] } })
    );
  });
});
