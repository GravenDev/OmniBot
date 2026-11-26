import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sleep = vi.hoisted(() => vi.fn(async (_ms: number) => undefined));
vi.mock("node:timers/promises", () => ({ setTimeout: sleep }));

import { fetchWithRetry, retryAfterMs, USER_AGENT } from "./http.js";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  sleep.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function status(code: number, headers: Record<string, string> = {}) {
  return new Response(null, { status: code, headers });
}

describe("retryAfterMs", () => {
  it("reads a number of seconds", () => {
    expect(retryAfterMs(status(429, { "Retry-After": "12" }))).toBe(12_000);
  });

  it("reads an HTTP date", () => {
    vi.useFakeTimers({ now: new Date("2026-10-25T10:00:00Z") });
    expect(
      retryAfterMs(
        status(429, { "Retry-After": "Sun, 25 Oct 2026 10:00:20 GMT" })
      )
    ).toBe(20_000);
  });

  it("is null when missing, invalid, zero or past", () => {
    vi.useFakeTimers({ now: new Date("2026-10-25T10:00:00Z") });
    expect(retryAfterMs(status(429))).toBeNull();
    expect(retryAfterMs(status(429, { "Retry-After": "soon" }))).toBeNull();
    expect(retryAfterMs(status(429, { "Retry-After": "0" }))).toBeNull();
    expect(
      retryAfterMs(
        status(429, { "Retry-After": "Sun, 25 Oct 2026 09:00:00 GMT" })
      )
    ).toBeNull();
  });
});

describe("fetchWithRetry", () => {
  it("sends the user agent with the caller's headers", async () => {
    fetchMock.mockResolvedValue(status(200));

    await fetchWithRetry(
      "https://example.org",
      { method: "POST", headers: { Accept: "text/plain" } },
      { timeoutMs: 1000 }
    );

    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "User-Agent": USER_AGENT,
      Accept: "text/plain",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries a server error with a growing delay, then returns the last answer", async () => {
    fetchMock.mockResolvedValue(status(503));
    const onRetry = vi.fn();

    const response = await fetchWithRetry(
      "https://example.org",
      {},
      { timeoutMs: 1000, onRetry }
    );

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    expect(onRetry).toHaveBeenCalledWith(503, 1, 1000);
  });

  it("waits what Retry-After says, capped", async () => {
    fetchMock
      .mockResolvedValueOnce(status(429, { "Retry-After": "7" }))
      .mockResolvedValueOnce(status(429, { "Retry-After": "120" }))
      .mockResolvedValueOnce(status(200));

    const response = await fetchWithRetry(
      "https://example.org",
      {},
      { timeoutMs: 1000 }
    );

    expect(response.status).toBe(200);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([7000, 30_000]);
  });

  it("returns a client error at once", async () => {
    fetchMock.mockResolvedValue(status(404));

    const response = await fetchWithRetry(
      "https://example.org",
      {},
      { timeoutMs: 1000 }
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
