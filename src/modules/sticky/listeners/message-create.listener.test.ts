import type { Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ get: vi.fn() }));
const poster = vi.hoisted(() => ({ bump: vi.fn() }));

vi.mock("#modules/sticky/services/store.js", () => ({ default: store }));
vi.mock("#modules/sticky/services/poster.js", () => ({ default: poster }));

const { default: listener } = await import("./message-create.listener.js");

const config = {} as never;

function fakeMessage(overrides: { authorId?: string; inGuild?: boolean } = {}) {
  return {
    guildId: "g1",
    channelId: "c1",
    channel: { id: "c1" },
    author: { id: overrides.authorId ?? "member" },
    client: { user: { id: "bot" } },
    inGuild: () => overrides.inGuild ?? true,
  };
}

async function run(message: ReturnType<typeof fakeMessage>) {
  await listener.execute(message as unknown as Message, config);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.get.mockResolvedValue({
    channelId: "c1",
    content: "x",
    messageId: null,
  });
});

describe("sticky messageCreate listener", () => {
  it("bumps the sticky of the channel", async () => {
    const message = fakeMessage();
    await run(message);
    expect(store.get).toHaveBeenCalledWith("g1", "c1");
    expect(poster.bump).toHaveBeenCalledWith(message.channel);
  });

  it("bumps after other bots' messages", async () => {
    await run(fakeMessage({ authorId: "other-bot" }));
    expect(poster.bump).toHaveBeenCalled();
  });

  it("does nothing in a channel without sticky", async () => {
    store.get.mockResolvedValue(null);
    await run(fakeMessage());
    expect(poster.bump).not.toHaveBeenCalled();
  });

  it.each([
    ["its own messages", { authorId: "bot" }],
    ["messages outside a guild", { inGuild: false }],
  ])("ignores %s", async (_, overrides) => {
    await run(fakeMessage(overrides));
    expect(store.get).not.toHaveBeenCalled();
    expect(poster.bump).not.toHaveBeenCalled();
  });

  it("ignores messages when the module has no config", async () => {
    await listener.execute(fakeMessage() as unknown as Message, undefined);
    expect(poster.bump).not.toHaveBeenCalled();
  });
});
