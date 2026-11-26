import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import requests, { RateLimitedError } from "./site-requests.service.js";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("requests to a chess site", () => {
  it("sends one request at a time to the same site", async () => {
    const first = deferred();
    fetchMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(new Response("second"));

    const a = requests.text("https://lichess.org/api/one", {});
    const b = requests.text("https://lichess.org/api/two", {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Lichess asks API clients for one request at a time.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    first.resolve(new Response("first"));
    await expect(Promise.all([a, b])).resolves.toEqual(["first", "second"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pauses a whole site after a 429, for the time it asks", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-26T12:00:00Z") });
    fetchMock.mockResolvedValueOnce(
      new Response("slow down", {
        status: 429,
        headers: { "Retry-After": "30" },
      })
    );

    const limited = requests.text("https://api.chess.com/pub/player/a", {});
    await expect(limited).rejects.toBeInstanceOf(RateLimitedError);
    await expect(limited).rejects.toMatchObject({ retryAfterMs: 30_000 });

    // www.chess.com is the same site: no request until the pause is over.
    await expect(
      requests.text("https://www.chess.com/callback/live/game/1", {})
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-11-26T12:00:31Z"));
    fetchMock.mockResolvedValueOnce(new Response("ok"));
    await expect(
      requests.text("https://www.chess.com/callback/live/game/1", {})
    ).resolves.toBe("ok");
  });

  it("waits a minute after a 429 that gives no delay", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    await expect(
      requests.text("https://other-site.example/api", {})
    ).rejects.toMatchObject({ retryAfterMs: 60_000 });
  });

  it("asks for JSON and parses it", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}'));
    await expect(requests.json("https://lichess.org/api/x")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock.mock.calls[0]![1]!.headers).toMatchObject({
      Accept: "application/json",
    });
  });
});
