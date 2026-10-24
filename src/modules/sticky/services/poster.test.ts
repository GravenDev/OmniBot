import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sticky } from "./store.js";

const state = vi.hoisted(() => ({
  sticky: null as Sticky | null,
}));

const store = vi.hoisted(() => ({
  get: vi.fn(async () => state.sticky && { ...state.sticky }),
  setMessageId: vi.fn(async (_g: string, _c: string, messageId: string) => {
    if (state.sticky) state.sticky.messageId = messageId;
  }),
  remove: vi.fn(async () => {
    const count = state.sticky ? 1 : 0;
    state.sticky = null;
    return count;
  }),
}));

vi.mock("./store.js", () => ({ default: store }));
vi.mock("#lib/logger.js", () => ({
  loggerMaker: () => ({ warn: vi.fn(), info: vi.fn() }),
}));

const { default: poster } = await import("./poster.js");

function apiError(code: number): DiscordAPIError {
  return new DiscordAPIError(
    { code, message: "error" },
    code,
    403,
    "POST",
    "/messages",
    {}
  );
}

function fakeChannel() {
  let next = 0;
  return {
    id: "c1",
    guildId: "g1",
    send: vi.fn(async () => ({ id: `m${++next}` })),
    messages: { delete: vi.fn(async () => undefined) },
  };
}

type Fake = ReturnType<typeof fakeChannel>;

function asChannel(channel: Fake) {
  return channel as never;
}

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  poster.reset();
  state.sticky = {
    channelId: "c1",
    content: "Read the rules",
    messageId: "old",
  };
});

describe("StickyPoster", () => {
  it("posts the sticky again and deletes the previous one", async () => {
    const channel = fakeChannel();
    poster.bump(asChannel(channel));
    await settle();

    expect(channel.send).toHaveBeenCalledWith({
      content: "Read the rules",
      allowedMentions: { parse: [] },
    });
    expect(store.setMessageId).toHaveBeenCalledWith("g1", "c1", "m1");
    expect(channel.messages.delete).toHaveBeenCalledWith("old");
  });

  it("posts before deleting, so a failed post keeps the previous one", async () => {
    const channel = fakeChannel();
    channel.send.mockRejectedValueOnce(new Error("network"));
    poster.bump(asChannel(channel));
    await settle();
    expect(channel.messages.delete).not.toHaveBeenCalled();
  });

  it("coalesces a burst of messages into one repost per run", async () => {
    const channel = fakeChannel();
    let release!: () => void;
    channel.send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ id: "m0" });
        })
    );
    poster.bump(asChannel(channel));
    await settle();
    for (let i = 0; i < 5; i++) poster.bump(asChannel(channel));
    release();
    await settle();

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(channel.messages.delete).toHaveBeenLastCalledWith("m0");
  });

  it("ignores a previous sticky already deleted", async () => {
    const channel = fakeChannel();
    channel.messages.delete.mockRejectedValueOnce(
      apiError(RESTJSONErrorCodes.UnknownMessage)
    );
    poster.bump(asChannel(channel));
    await settle();
    expect(store.setMessageId).toHaveBeenCalledWith("g1", "c1", "m1");
  });

  it("pauses a channel where the bot cannot post", async () => {
    vi.useFakeTimers();
    try {
      const channel = fakeChannel();
      channel.send.mockRejectedValueOnce(
        apiError(RESTJSONErrorCodes.MissingPermissions)
      );
      poster.bump(asChannel(channel));
      await settle();

      vi.advanceTimersByTime(10 * 60_000 - 1);
      poster.bump(asChannel(channel));
      await settle();
      expect(channel.send).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      poster.bump(asChannel(channel));
      await settle();
      expect(channel.send).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing once the sticky is removed", async () => {
    state.sticky = null;
    const channel = fakeChannel();
    poster.bump(asChannel(channel));
    await settle();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it("unsticks by removing the entry and its message", async () => {
    const channel = fakeChannel();
    expect(await poster.unstick(asChannel(channel))).toBe(true);
    expect(store.remove).toHaveBeenCalledWith("g1", "c1");
    expect(channel.messages.delete).toHaveBeenCalledWith("old");
    expect(await poster.unstick(asChannel(channel))).toBe(false);
  });

  it("surfaces a failed post to the caller", async () => {
    const channel = fakeChannel();
    channel.send.mockRejectedValueOnce(new Error("network"));
    await expect(poster.post(asChannel(channel))).rejects.toThrow("network");
  });

  it("pauses the channel when a direct post lacks permissions", async () => {
    const channel = fakeChannel();
    channel.send.mockRejectedValueOnce(
      apiError(RESTJSONErrorCodes.MissingAccess)
    );
    await expect(poster.post(asChannel(channel))).rejects.toThrow();
    poster.bump(asChannel(channel));
    await settle();
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it("withdraws the new message when it cannot be recorded", async () => {
    const channel = fakeChannel();
    store.setMessageId.mockRejectedValueOnce(new Error("database"));
    await expect(poster.post(asChannel(channel))).rejects.toThrow("database");
    expect(channel.messages.delete).toHaveBeenCalledWith("m1");
    expect(channel.messages.delete).not.toHaveBeenCalledWith("old");
  });
});
