import { DiscordAPIError, type Message, RESTJSONErrorCodes } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  creationFailure,
  ThreadCreationQueue,
  type ThreadJob,
} from "./thread-creation-queue.js";

const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));
vi.mock("#lib/logger.js", () => ({ loggerMaker: () => log }));

/** Shared startThread spy so a test can count creations across all messages. */
let startThread: ReturnType<typeof vi.fn>;
let send: ReturnType<typeof vi.fn>;

function job(
  name: string,
  welcomeMessage?: string,
  channelId = "chan"
): ThreadJob {
  return {
    message: {
      id: name,
      channelId,
      channel: { id: channelId },
      startThread,
    } as unknown as Message,
    threadName: name,
    welcomeMessage,
  };
}

/** Names passed to startThread, in call order. */
function createdNames(): string[] {
  return startThread.mock.calls.map((call) => call[0].name as string);
}

beforeEach(() => {
  vi.useFakeTimers();
  send = vi.fn().mockResolvedValue(undefined);
  startThread = vi.fn().mockResolvedValue({ send });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ThreadCreationQueue", () => {
  it("creates every queued thread in FIFO order, across rate-limit windows", async () => {
    const queue = new ThreadCreationQueue();
    const names = Array.from({ length: 12 }, (_, i) => `t${i}`);

    names.forEach((name) => queue.enqueue("g1", job(name)));
    await vi.runAllTimersAsync();

    expect(startThread).toHaveBeenCalledTimes(12);
    expect(createdNames()).toEqual(names); // nothing dropped, order preserved
  });

  it("paces at most 5 creations per 10s window", async () => {
    const queue = new ThreadCreationQueue();
    Array.from({ length: 6 }, (_, i) => job(`t${i}`)).forEach((j) =>
      queue.enqueue("g1", j)
    );

    // Immediate work only — the 6th is held back by the window.
    await vi.advanceTimersByTimeAsync(0);
    expect(startThread).toHaveBeenCalledTimes(5);

    // Once the window frees, the 6th goes through.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(startThread).toHaveBeenCalledTimes(6);
  });

  it("keeps a separate window per guild", async () => {
    const queue = new ThreadCreationQueue();
    for (let i = 0; i < 5; i++) queue.enqueue("g1", job(`a${i}`));
    for (let i = 0; i < 5; i++) queue.enqueue("g2", job(`b${i}`));

    // Each guild has its own 5-slot window, so all 10 fire immediately.
    await vi.advanceTimersByTimeAsync(0);
    expect(startThread).toHaveBeenCalledTimes(10);
  });

  it("posts the welcome message when one is configured, otherwise not", async () => {
    const queue = new ThreadCreationQueue();
    queue.enqueue("g1", job("with", "bienvenue"));
    queue.enqueue("g1", job("without"));
    await vi.runAllTimersAsync();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("bienvenue");
  });
});

const apiError = (code: number) =>
  new DiscordAPIError(
    { code, message: "refused" },
    code,
    400,
    "POST",
    "/channels/chan/messages/id/threads",
    {}
  );

describe("creationFailure", () => {
  it("names each expected refusal by its real cause", () => {
    expect(creationFailure(RESTJSONErrorCodes.UnknownMessage)).toEqual({
      reason: "message deleted",
      level: "debug",
    });
    expect(
      creationFailure(RESTJSONErrorCodes.ThreadAlreadyCreatedForMessage)
    ).toEqual({ reason: "thread already exists", level: "debug" });
    expect(creationFailure(RESTJSONErrorCodes.MaximumActiveThreads)).toEqual({
      reason: "thread limit reached",
      level: "throttled",
    });
    for (const code of [
      RESTJSONErrorCodes.MissingPermissions,
      RESTJSONErrorCodes.MissingAccess,
    ]) {
      expect(creationFailure(code)).toEqual({
        reason: "missing permissions",
        level: "throttled",
      });
    }
  });

  it("leaves anything else to the error log", () => {
    expect(creationFailure(RESTJSONErrorCodes.ThreadLocked)).toBeNull();
    expect(creationFailure(undefined)).toBeNull();
  });
});

describe("creation failures in the log", () => {
  beforeEach(() => vi.clearAllMocks());

  async function fail(error: unknown, channelId: string) {
    startThread = vi.fn().mockRejectedValue(error);
    const queue = new ThreadCreationQueue();
    queue.enqueue("guild", job("msg", undefined, channelId));
    await vi.runAllTimersAsync();
  }

  it("warns once an hour per channel and cause, whatever the code", async () => {
    await fail(apiError(RESTJSONErrorCodes.MissingAccess), "c-perm");
    await fail(apiError(RESTJSONErrorCodes.MissingPermissions), "c-perm");
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.debug).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("reason = missing permissions")
    );
  });

  it("still warns for another cause on the same channel", async () => {
    await fail(apiError(RESTJSONErrorCodes.MissingPermissions), "c-two");
    await fail(apiError(RESTJSONErrorCodes.MaximumActiveThreads), "c-two");
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it("keeps a channel deleted while jobs wait in debug", async () => {
    await fail(apiError(RESTJSONErrorCodes.UnknownChannel), "c-deleted");
    expect(log.error).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("reason = channel deleted")
    );
  });

  it("keeps an expected, harmless outcome in debug", async () => {
    await fail(apiError(RESTJSONErrorCodes.UnknownMessage), "c-gone");
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("reason = message deleted")
    );
  });

  it("logs anything unexpected as an error", async () => {
    await fail(new Error("network"), "c-error");
    expect(log.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Thread creation failed")
    );
  });

  it("tells a refused welcome message apart from a thread not created", async () => {
    send = vi
      .fn()
      .mockRejectedValue(apiError(RESTJSONErrorCodes.MissingPermissions));
    startThread = vi.fn().mockResolvedValue({ id: "thread", send });
    const queue = new ThreadCreationQueue();
    queue.enqueue("guild", job("msg", "welcome", "c-welcome"));
    await vi.runAllTimersAsync();
    const lines = Object.values(log)
      .flatMap((fn) => fn.mock.calls)
      .map((call) => String(call.at(-1)));
    expect(log.warn).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Thread created without its welcome message")
    );
    expect(lines.some((l) => l.startsWith("Thread not created"))).toBe(false);
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining("Thread created | ")
    );
    expect(
      lines.some((l) =>
        l.startsWith("Thread created without its welcome message")
      )
    ).toBe(true);
  });

  it("logs a welcome message Discord rejects as malformed as an error", async () => {
    // A config problem, not a permission: every thread would lack it.
    send = vi
      .fn()
      .mockRejectedValue(
        apiError(RESTJSONErrorCodes.InvalidFormBodyOrContentType)
      );
    startThread = vi.fn().mockResolvedValue({ id: "thread", send });
    const queue = new ThreadCreationQueue();
    queue.enqueue("guild", job("msg", "welcome", "c-malformed"));
    await vi.runAllTimersAsync();
    expect(log.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Thread created without its welcome message")
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("warns when the new thread is deleted before its welcome message", async () => {
    send = vi
      .fn()
      .mockRejectedValue(apiError(RESTJSONErrorCodes.UnknownChannel));
    startThread = vi.fn().mockResolvedValue({ id: "thread", send });
    const queue = new ThreadCreationQueue();
    queue.enqueue("guild", job("msg", "welcome", "c-thread-gone"));
    await vi.runAllTimersAsync();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("leaves the code out of the welcome log for a non-Discord error", async () => {
    send = vi.fn().mockRejectedValue(new Error("network"));
    startThread = vi.fn().mockResolvedValue({ id: "thread", send });
    const queue = new ThreadCreationQueue();
    queue.enqueue("guild", job("msg", "welcome", "c-network"));
    await vi.runAllTimersAsync();
    expect(log.error).toHaveBeenCalledOnce();
    expect(String(log.error.mock.calls[0]?.at(-1))).not.toContain("code =");
  });
});
