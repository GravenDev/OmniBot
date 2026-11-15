import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClashApiError,
  ClashNotFoundError,
  ClashRateLimitedError,
} from "#modules/clash-of-code/api.js";

const sleep = vi.hoisted(() => vi.fn(async (_ms: number) => undefined));
vi.mock("node:timers/promises", () => ({ setTimeout: sleep }));

import codingame from "./codingame.service.js";

const HANDLE = "41140793b2b34c8b62ebcb650e8b45c24694f07";

// The fields the parser requires (see api.test.ts for a real response).
const REPORT = {
  publicHandle: HANDLE,
  started: true,
  finished: true,
  players: [],
};

const fetchMock = vi.fn();

function reply(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), init);
}

beforeEach(() => {
  fetchMock.mockReset();
  sleep.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchClashReport", () => {
  it("posts the handle as a one-item JSON array", async () => {
    fetchMock.mockResolvedValue(reply(REPORT));
    await codingame.fetchClashReport(HANDLE);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("findClashReportInfoByHandle");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify([HANDLE]));
  });

  it("turns CodinGame's 422 into a not-found error", async () => {
    fetchMock.mockResolvedValue(
      reply({ id: 502, message: "Clash not found" }, { status: 422 })
    );
    await expect(codingame.fetchClashReport(HANDLE)).rejects.toBeInstanceOf(
      ClashNotFoundError
    );
  });

  it("retries a server error, then gives up", async () => {
    fetchMock.mockResolvedValue(reply({}, { status: 503 }));
    await expect(codingame.fetchClashReport(HANDLE)).rejects.toBeInstanceOf(
      ClashApiError
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("tells a lasting rate limit apart, with the wait CodinGame asks", async () => {
    fetchMock.mockResolvedValue(
      reply({}, { status: 429, headers: { "retry-after": "12" } })
    );
    const error = await codingame
      .fetchClashReport(HANDLE)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ClashRateLimitedError);
    expect(error).toMatchObject({ handle: HANDLE, retryAfterMs: 12_000 });
    expect(sleep).toHaveBeenCalledWith(12_000);
  });

  it("reads Retry-After given as an HTTP date", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-25T10:00:00Z") });
    fetchMock.mockResolvedValue(
      reply(
        {},
        {
          status: 429,
          headers: { "retry-after": "Sun, 25 Oct 2026 10:00:20 GMT" },
        }
      )
    );
    const error = await codingame
      .fetchClashReport(HANDLE)
      .catch((err: unknown) => err);
    vi.useRealTimers();
    expect(error).toMatchObject({ retryAfterMs: 20_000 });
  });

  it("recovers when a retry succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(reply({}, { status: 429 }))
      .mockResolvedValueOnce(reply(REPORT));
    await expect(codingame.fetchClashReport(HANDLE)).resolves.toMatchObject({
      handle: HANDLE,
    });
  });
});
