import { DiscordAPIError, MessageFlags, RESTJSONErrorCodes } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sticky } from "./store.js";

const state = vi.hoisted(() => ({
  sticky: null as Sticky | null,
}));

const store = vi.hoisted(() => ({
  get: vi.fn(async () => state.sticky && { ...state.sticky }),
  set: vi.fn(async (_g: string, channelId: string, content: string) => {
    state.sticky = state.sticky
      ? { ...state.sticky, content }
      : { channelId, content, messageId: null };
  }),
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

const { StickyPoster } = await import("./poster.js");

let poster: InstanceType<typeof StickyPoster>;

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

// Every channel a test creates, so that each message it sent can be checked.
const channels: ReturnType<typeof fakeChannel>[] = [];

function fakeChannel() {
  let next = 0;
  const channel = {
    id: "c1",
    guildId: "g1",
    send: vi.fn(async (_options: unknown) => ({ id: `m${++next}` })),
    messages: { delete: vi.fn(async () => undefined) },
  };
  channels.push(channel);
  return channel;
}

type Fake = ReturnType<typeof fakeChannel>;

function asChannel(channel: Fake) {
  return channel as never;
}

async function drain(channel: Fake) {
  await (
    poster as unknown as {
      queue: { run: (key: string, task: () => Promise<void>) => Promise<void> };
    }
  ).queue.run(channel.id, async () => {});
}

// A sticky is reposted after every message: whatever the path (first post,
// repost, retry), it must never send a push notification.
afterEach(() => {
  for (const channel of channels.splice(0)) {
    for (const [options] of channel.send.mock.calls) {
      expect(options).toMatchObject({
        flags: MessageFlags.SuppressNotifications,
      });
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  poster = new StickyPoster();
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
    await drain(channel);

    expect(channel.send).toHaveBeenCalledWith({
      content: "Read the rules",
      allowedMentions: { parse: [] },
      flags: MessageFlags.SuppressNotifications,
    });
    expect(store.setMessageId).toHaveBeenCalledWith("g1", "c1", "m1");
    expect(channel.messages.delete).toHaveBeenCalledWith("old");
  });

  it("posts before deleting, so a failed post keeps the previous one", async () => {
    const channel = fakeChannel();
    channel.send.mockRejectedValueOnce(new Error("network"));
    poster.bump(asChannel(channel));
    await drain(channel);
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
    await vi.waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 5; i++) poster.bump(asChannel(channel));
    release();
    await drain(channel);

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(channel.messages.delete).toHaveBeenLastCalledWith("m0");
  });

  it("ignores a previous sticky already deleted", async () => {
    const channel = fakeChannel();
    channel.messages.delete.mockRejectedValueOnce(
      apiError(RESTJSONErrorCodes.UnknownMessage)
    );
    poster.bump(asChannel(channel));
    await drain(channel);
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
      await drain(channel);

      vi.advanceTimersByTime(10 * 60_000 - 1);
      poster.bump(asChannel(channel));
      await drain(channel);
      expect(channel.send).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      poster.bump(asChannel(channel));
      await drain(channel);
      expect(channel.send).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing once the sticky is removed", async () => {
    state.sticky = null;
    const channel = fakeChannel();
    poster.bump(asChannel(channel));
    await drain(channel);
    expect(channel.send).not.toHaveBeenCalled();
  });

  it("withdraws the new message when it cannot be recorded", async () => {
    const channel = fakeChannel();
    store.setMessageId.mockRejectedValueOnce(new Error("database"));
    poster.bump(asChannel(channel));
    await drain(channel);
    expect(channel.messages.delete).toHaveBeenCalledWith("m1");
    expect(channel.messages.delete).not.toHaveBeenCalledWith("old");
  });
});

describe("StickyPoster.set", () => {
  it("saves the content and posts it at once", async () => {
    const channel = fakeChannel();
    expect(await poster.set(asChannel(channel), "New rules")).toBe(true);
    expect(store.set).toHaveBeenCalledWith("g1", "c1", "New rules");
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: "New rules" })
    );
  });

  it("reports a failed post without throwing", async () => {
    const channel = fakeChannel();
    channel.send.mockRejectedValueOnce(new Error("network"));
    expect(await poster.set(asChannel(channel), "New rules")).toBe(false);
  });

  it("lets a failed save reach the caller", async () => {
    store.set.mockRejectedValueOnce(new Error("database"));
    await expect(
      poster.set(asChannel(fakeChannel()), "New rules")
    ).rejects.toThrow("database");
  });

  it("pauses the channel when the post lacks permissions", async () => {
    const channel = fakeChannel();
    channel.send.mockRejectedValueOnce(
      apiError(RESTJSONErrorCodes.MissingAccess)
    );
    expect(await poster.set(asChannel(channel), "New rules")).toBe(false);
    poster.bump(asChannel(channel));
    await drain(channel);
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it("lifts a pause to try again", async () => {
    const channel = fakeChannel();
    channel.send.mockRejectedValueOnce(
      apiError(RESTJSONErrorCodes.MissingAccess)
    );
    poster.bump(asChannel(channel));
    await drain(channel);
    expect(await poster.set(asChannel(channel), "New rules")).toBe(true);
    poster.bump(asChannel(channel));
    await drain(channel);
    expect(channel.send).toHaveBeenCalledTimes(3);
  });

  it("cannot be undone halfway by a concurrent removal", async () => {
    const channel = fakeChannel();
    const removal = poster.unstick(asChannel(channel));
    const setting = poster.set(asChannel(channel), "New rules");
    await removal;
    expect(await setting).toBe(true);
    expect(state.sticky?.content).toBe("New rules");
  });
});

describe("StickyPoster.unstick", () => {
  it("removes the entry and its message", async () => {
    const channel = fakeChannel();
    expect(await poster.unstick(asChannel(channel))).toEqual({
      removed: true,
      leftover: false,
    });
    expect(store.remove).toHaveBeenCalledWith("g1", "c1");
    expect(channel.messages.delete).toHaveBeenCalledWith("old");
    expect(await poster.unstick(asChannel(channel))).toEqual({
      removed: false,
      leftover: false,
    });
  });

  it("tells when the last copy stays on screen", async () => {
    const channel = fakeChannel();
    channel.messages.delete.mockRejectedValueOnce(
      apiError(RESTJSONErrorCodes.MissingAccess)
    );
    expect(await poster.unstick(asChannel(channel))).toEqual({
      removed: true,
      leftover: true,
    });
  });

  it("does not count a copy already deleted as left over", async () => {
    const channel = fakeChannel();
    channel.messages.delete.mockRejectedValueOnce(
      apiError(RESTJSONErrorCodes.UnknownMessage)
    );
    expect((await poster.unstick(asChannel(channel))).leftover).toBe(false);
  });
});
