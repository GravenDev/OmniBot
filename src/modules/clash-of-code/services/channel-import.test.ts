import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { silenceLogs } from "#lib/testing.js";
import type { ClashReport } from "./api.js";

// The fake timers do not patch node:timers/promises: route it to setTimeout.
vi.mock("node:timers/promises", () => ({
  setTimeout: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}));

const mocks = vi.hoisted(() => ({
  fetchClashReport: vi.fn(),
  store: { isKnown: vi.fn(), importReport: vi.fn() },
}));

vi.mock("./api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api.js")>()),
  fetchClashReport: mocks.fetchClashReport,
}));
vi.mock("./store.js", () => ({ default: mocks.store }));

import { ClashNotFoundError, ClashRateLimitedError } from "./api.js";
import {
  importClashes,
  MAX_RATE_LIMIT_PAUSE_MS,
  MAX_RATE_LIMIT_RETRIES,
  RATE_LIMIT_PAUSE_MS,
  REQUEST_SPACING_MS,
} from "./channel-import.js";

function report(overrides: Partial<ClashReport> = {}): ClashReport {
  return {
    handle: "h",
    mode: "FASTEST",
    startedAt: null,
    started: true,
    finished: true,
    players: [],
    ...overrides,
  };
}

const clash = (handle: string) => ({
  handle,
  channelId: "chan",
  messageId: `m-${handle}`,
});

beforeEach(() => {
  silenceLogs();
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.store.isKnown.mockResolvedValue(false);
  mocks.store.importReport.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function run(clashes: ReturnType<typeof clash>[], advanceMs: number) {
  const result = importClashes("g", clashes);
  await vi.advanceTimersByTimeAsync(advanceMs);
  return result;
}

describe("importClashes", () => {
  it("sorts every game into the summary, without posting anything", async () => {
    mocks.store.isKnown.mockImplementation(
      async (_g, handle) => handle === "known"
    );
    mocks.fetchClashReport.mockImplementation(async (handle: string) => {
      if (handle === "unknown") throw new ClashNotFoundError(handle);
      if (handle === "running") return report({ finished: false });
      if (handle === "broken") throw new Error("down");
      return report();
    });
    const summary = await run(
      ["done", "known", "unknown", "running", "broken"].map(clash),
      10 * REQUEST_SPACING_MS
    );
    expect(summary).toEqual({
      found: 5,
      done: 5,
      imported: 1,
      known: 1,
      unfinished: 1,
      unknown: 1,
      failed: 1,
      stopped: null,
      pausedUntil: null,
    });
    expect(mocks.store.importReport).toHaveBeenCalledWith("g", report(), {
      channelId: "chan",
      messageId: "m-done",
    });
  });

  it("counts a game imported meanwhile as already recorded", async () => {
    mocks.fetchClashReport.mockResolvedValue(report());
    mocks.store.importReport.mockResolvedValue(false);
    const summary = await run([clash("a")], REQUEST_SPACING_MS);
    expect(summary.known).toBe(1);
  });

  it("spaces its requests to CodinGame", async () => {
    mocks.fetchClashReport.mockResolvedValue(report());
    const result = importClashes("g", ["a", "b", "c"].map(clash));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REQUEST_SPACING_MS);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(REQUEST_SPACING_MS);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(3);
    await expect(result).resolves.toMatchObject({ imported: 3 });
  });

  it("pauses for as long as CodinGame asks, then tries the game again", async () => {
    mocks.fetchClashReport
      .mockRejectedValueOnce(new ClashRateLimitedError("a", 20_000))
      .mockResolvedValue(report());
    const result = importClashes("g", [clash("a")]);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(2);
    await expect(result).resolves.toMatchObject({ imported: 1, failed: 0 });
  });

  it("pauses a default time without Retry-After, and gives up after a while", async () => {
    mocks.fetchClashReport.mockRejectedValue(
      new ClashRateLimitedError("a", null)
    );
    const summary = await run(
      [clash("a")],
      (MAX_RATE_LIMIT_RETRIES + 1) * RATE_LIMIT_PAUSE_MS
    );
    expect(mocks.fetchClashReport).toHaveBeenCalledTimes(
      MAX_RATE_LIMIT_RETRIES + 1
    );
    expect(summary).toMatchObject({ failed: 1, imported: 0 });
  });

  it("reports its progress after each game", async () => {
    mocks.fetchClashReport.mockResolvedValue(report());
    const onProgress = vi.fn();
    const result = importClashes("g", ["a", "b"].map(clash), { onProgress });
    await vi.advanceTimersByTimeAsync(2 * REQUEST_SPACING_MS);
    await result;
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ done: 2, found: 2 })
    );
  });

  it("reports a pause, with when it resumes", async () => {
    mocks.fetchClashReport
      .mockRejectedValueOnce(new ClashRateLimitedError("a", 20_000))
      .mockResolvedValue(report());
    const onProgress = vi.fn();
    const result = importClashes("g", [clash("a")], { onProgress });
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    expect(onProgress.mock.calls[0]![0]).toMatchObject({
      done: 0,
      pausedUntil: Date.now(),
    });
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ done: 1, pausedUntil: null })
    );
  });

  it("stops instead of waiting longer than it allows", async () => {
    mocks.fetchClashReport.mockRejectedValue(
      new ClashRateLimitedError("a", MAX_RATE_LIMIT_PAUSE_MS + 1)
    );
    const summary = await run(["a", "b"].map(clash), REQUEST_SPACING_MS);
    expect(summary).toMatchObject({ stopped: "rateLimit", done: 0, failed: 0 });
  });

  it("starts no game past its deadline", async () => {
    mocks.fetchClashReport.mockResolvedValue(report());
    const result = importClashes("g", ["a", "b", "c", "d"].map(clash), {
      deadline: Date.now() + REQUEST_SPACING_MS + 1,
    });
    await vi.advanceTimersByTimeAsync(10 * REQUEST_SPACING_MS);
    await expect(result).resolves.toMatchObject({
      stopped: "time",
      found: 4,
      done: 2,
    });
  });

  it("stops rather than pause past its deadline", async () => {
    mocks.fetchClashReport.mockRejectedValue(
      new ClashRateLimitedError("a", 20_000)
    );
    const late = importClashes("g", [clash("a")], {
      deadline: Date.now() + 10_000,
    });
    await vi.advanceTimersByTimeAsync(REQUEST_SPACING_MS);
    await expect(late).resolves.toMatchObject({ stopped: "time", done: 0 });
  });
});
