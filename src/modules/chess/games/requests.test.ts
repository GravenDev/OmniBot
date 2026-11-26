import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "../services/site-requests.service.js";
import { fetchChesscomGames } from "./fetch.js";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Chess.com lists under a rate limit", () => {
  it("does not show a Chess.com list missing the months a 429 cut off", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-27T12:00:00Z") });
    const archive = (month: string) =>
      `https://api.chess.com/pub/player/bob/games/${month}`;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/games/archives")) {
        return new Response(
          JSON.stringify({ archives: [archive("2026/10"), archive("2026/11")] })
        );
      }
      if (url === archive("2026/10")) {
        return new Response("", { status: 429 });
      }
      return new Response(JSON.stringify({ games: [] }));
    });

    await expect(fetchChesscomGames("bob")).rejects.toBeInstanceOf(
      RateLimitedError
    );
  });

  it("does not turn a rate limit on ongoing games into an empty list", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-28T12:00:00Z") });
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/games/archives")) {
        return new Response(JSON.stringify({ archives: [] }));
      }
      return new Response("", { status: 429 });
    });

    await expect(fetchChesscomGames("carol")).rejects.toBeInstanceOf(
      RateLimitedError
    );
  });

  it("leaves no rejection unhandled when both Chess.com lists are rate limited", async () => {
    vi.useFakeTimers({
      now: new Date("2026-11-29T12:00:00Z"),
      toFake: ["Date"],
    });
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    try {
      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/games/archives")) {
          return new Response(
            JSON.stringify({
              archives: ["https://api.chess.com/pub/player/dan/games/2026/11"],
            })
          );
        }
        return new Response("", { status: 429 });
      });

      await expect(fetchChesscomGames("dan")).rejects.toBeInstanceOf(
        RateLimitedError
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });
});
