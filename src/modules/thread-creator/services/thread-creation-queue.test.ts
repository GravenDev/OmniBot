import type { Message } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ThreadCreationQueue,
  type ThreadJob,
} from "./thread-creation-queue.js";

/** Shared startThread spy so a test can count creations across all messages. */
let startThread: ReturnType<typeof vi.fn>;
let send: ReturnType<typeof vi.fn>;

function job(name: string, welcomeMessage?: string): ThreadJob {
  return {
    message: {
      id: name,
      channel: { id: "chan" },
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
