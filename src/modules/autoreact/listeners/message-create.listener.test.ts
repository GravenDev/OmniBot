import { DiscordAPIError, RESTJSONErrorCodes, type Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  emojiFor: vi.fn(),
  remove: vi.fn(),
}));

const logger = vi.hoisted(() => ({ debug: vi.fn(), warn: vi.fn() }));

vi.mock("#modules/autoreact/services/store.js", () => ({ default: store }));
vi.mock("#lib/logger.js", () => ({ loggerMaker: () => logger }));

const { default: listener, resetPauses } =
  await import("./message-create.listener.js");

const config = {} as never;

function fakeMessage(
  overrides: { authorId?: string; system?: boolean; inGuild?: boolean } = {}
) {
  return {
    guildId: "g1",
    channelId: "c1",
    system: overrides.system ?? false,
    author: { id: overrides.authorId ?? "member" },
    client: { user: { id: "bot" } },
    inGuild: () => overrides.inGuild ?? true,
    react: vi.fn().mockResolvedValue(undefined),
  };
}

function apiError(code: number): DiscordAPIError {
  return new DiscordAPIError(
    { code, message: "error" },
    code,
    400,
    "PUT",
    "/reactions",
    {}
  );
}

async function run(message: ReturnType<typeof fakeMessage>) {
  await listener.execute(message as unknown as Message, config);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPauses();
  store.emojiFor.mockResolvedValue("👍");
});

describe("autoreact messageCreate listener", () => {
  it("reacts with the channel's emoji", async () => {
    const message = fakeMessage();
    await run(message);
    expect(store.emojiFor).toHaveBeenCalledWith("g1", "c1");
    expect(message.react).toHaveBeenCalledWith("👍");
  });

  it("does nothing in a channel without reaction", async () => {
    store.emojiFor.mockResolvedValue(null);
    const message = fakeMessage();
    await run(message);
    expect(message.react).not.toHaveBeenCalled();
  });

  it("reacts to other bots' messages", async () => {
    const message = fakeMessage({ authorId: "other-bot" });
    await run(message);
    expect(message.react).toHaveBeenCalled();
  });

  it.each([
    ["its own messages", { authorId: "bot" }],
    ["system messages", { system: true }],
    ["messages outside a guild", { inGuild: false }],
  ])("ignores %s", async (_, overrides) => {
    const message = fakeMessage(overrides);
    await run(message);
    expect(store.emojiFor).not.toHaveBeenCalled();
    expect(message.react).not.toHaveBeenCalled();
  });

  it("ignores messages when the module has no config", async () => {
    const message = fakeMessage();
    await listener.execute(message as unknown as Message, undefined);
    expect(message.react).not.toHaveBeenCalled();
  });

  it("removes the reaction when its custom emoji no longer exists", async () => {
    store.emojiFor.mockResolvedValue("<:hype:111111111111111111>");
    const first = fakeMessage();
    first.react.mockRejectedValue(apiError(RESTJSONErrorCodes.UnknownEmoji));
    await run(first);
    expect(store.remove).toHaveBeenCalledWith("g1", "c1");

    const second = fakeMessage();
    await run(second);
    expect(second.react).toHaveBeenCalled();
  });

  it("pauses without removing a Unicode emoji Discord refuses", async () => {
    const first = fakeMessage();
    first.react.mockRejectedValue(apiError(RESTJSONErrorCodes.UnknownEmoji));
    await run(first);
    expect(store.remove).not.toHaveBeenCalled();

    const second = fakeMessage();
    await run(second);
    expect(second.react).not.toHaveBeenCalled();
  });

  it("neither removes nor pauses when the author blocked the bot", async () => {
    const first = fakeMessage();
    first.react.mockRejectedValue(
      apiError(RESTJSONErrorCodes.ReactionWasBlocked)
    );
    await run(first);
    expect(store.remove).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();

    const second = fakeMessage();
    await run(second);
    expect(second.react).toHaveBeenCalled();
  });

  it("pauses a channel where the bot lacks permissions", async () => {
    const first = fakeMessage();
    first.react.mockRejectedValue(
      apiError(RESTJSONErrorCodes.MissingPermissions)
    );
    await run(first);

    const second = fakeMessage();
    await run(second);
    expect(second.react).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("reacts again once the pause is over", async () => {
    vi.useFakeTimers();
    try {
      const first = fakeMessage();
      first.react.mockRejectedValue(
        apiError(RESTJSONErrorCodes.MissingPermissions)
      );
      await run(first);

      vi.advanceTimersByTime(10 * 60_000 - 1);
      const during = fakeMessage();
      await run(during);
      expect(during.react).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      const after = fakeMessage();
      await run(after);
      expect(after.react).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps reacting after another failure", async () => {
    const first = fakeMessage();
    first.react.mockRejectedValue(new Error("network"));
    await run(first);

    const second = fakeMessage();
    await run(second);
    expect(second.react).toHaveBeenCalled();
  });
});
