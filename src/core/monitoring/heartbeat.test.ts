import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("#lib/logger.js", () => ({ loggerMaker: () => log }));

const { startHeartbeat } = await import("./heartbeat.js");
type Health = import("./heartbeat.js").Health;

describe("startHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports right away, then at every interval until stopped", async () => {
    const report = vi.fn(async (_health: Health) => {});
    const stop = startHeartbeat({
      check: async () => ({ up: true, msg: "OK", ping: 30 }),
      reporters: [report],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]?.[0]).toEqual({
      up: true,
      msg: "OK",
      ping: 30,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(report).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("reports down when the health check keeps throwing", async () => {
    const report = vi.fn(async (_health: Health) => {});
    const stop = startHeartbeat({
      check: async () => {
        throw new Error("boom");
      },
      reporters: [report],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await stop();
    expect(report.mock.calls.at(-1)?.[0]).toEqual({
      up: false,
      msg: "Health check failed",
    });
  });

  it("does not report a single failing check: one more must confirm it", async () => {
    const results: Health[] = [
      { up: true, msg: "OK" },
      { up: false, msg: "Discord gateway Resuming" },
      { up: true, msg: "OK" },
      { up: false, msg: "Database unreachable" },
      { up: false, msg: "Database unreachable" },
    ];
    const report = vi.fn(async (_health: Health) => {});
    const stop = startHeartbeat({
      check: async () => results.shift() ?? { up: true, msg: "OK" },
      reporters: [report],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(4_000);
    await stop();
    expect(report.mock.calls.map(([health]) => health.msg)).toEqual([
      "OK",
      "OK",
      "Database unreachable",
    ]);
  });

  it("keeps beating after the check throws synchronously", async () => {
    const report = vi.fn(async (_health: Health) => {});
    const stop = startHeartbeat({
      check: () => {
        throw new Error("sync");
      },
      reporters: [report],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await stop();
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("keeps beating after a reporter throws synchronously", async () => {
    const other = vi.fn(async (_health: Health) => {});
    const stop = startHeartbeat({
      check: async () => ({ up: true, msg: "OK" }),
      reporters: [
        () => {
          throw new Error("sync");
        },
        other,
      ],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await stop();
    expect(other).toHaveBeenCalledTimes(3);
  });

  it("hands each heartbeat to every reporter, even after one throws", async () => {
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });
    const other = vi.fn(async (_health: Health) => {});
    const stop = startHeartbeat({
      check: async () => ({ up: true, msg: "OK" }),
      reporters: [failing, other],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    stop();
    expect(failing).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(2);
  });

  it("stops at once while a check hangs, and reports nothing more", async () => {
    const report = vi.fn(async (_health: Health) => {});
    const stop = startHeartbeat({
      check: () => new Promise<Health>(() => {}),
      reporters: [report],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    let stopped = false;
    void stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(report).not.toHaveBeenCalled();
  });

  it("aborts a report in flight when stopped", async () => {
    let signal: AbortSignal | undefined;
    const stop = startHeartbeat({
      check: async () => ({ up: true, msg: "OK" }),
      reporters: [
        (_health, abort) => {
          signal = abort;
          return new Promise<void>((resolve) =>
            abort.addEventListener("abort", () => resolve())
          );
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBe(false);
    await stop();
    expect(signal?.aborted).toBe(true);
  });

  it("logs a failing check once, not on every heartbeat", async () => {
    const stop = startHeartbeat({
      check: async () => {
        throw new Error("boom");
      },
      reporters: [],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await stop();
    const lines = [...log.error.mock.calls, ...log.warn.mock.calls];
    expect(lines).toHaveLength(1);
  });

  it("never overlaps a slow check with the next one", async () => {
    let running = 0;
    let overlapped = false;
    const stop = startHeartbeat({
      check: async () => {
        running++;
        overlapped ||= running > 1;
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        running--;
        return { up: true, msg: "OK" };
      },
      reporters: [],
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    stop();
    expect(overlapped).toBe(false);
  });
});
