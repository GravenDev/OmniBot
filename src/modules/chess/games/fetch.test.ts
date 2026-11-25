import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchChesscomGames,
  fetchGameFromUrl,
  fetchLichessGames,
  gameSummaryFromPgn,
  GAME_WINDOW_DAYS,
  MAX_GAMES,
} from "./fetch.js";

const NOW = new Date("2026-11-25T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const fetchMock = vi.fn<typeof fetch>();

function samplePgn(
  options: {
    site?: string;
    gameId?: string;
    date?: string;
    time?: string;
    timeControl?: string;
    white?: string;
    result?: string;
  } = {}
): string {
  const {
    site = "https://lichess.org/abcd1234",
    gameId = new URL(site).pathname.split("/").filter(Boolean).at(-1) ??
      "abcd1234",
    date = "2026.11.25",
    time = "10:00:00",
    timeControl = "180+2",
    white = "Alice",
    result = "1-0",
  } = options;
  return [
    '[Event "Rated game"]',
    `[Site "${site}"]`,
    `[White "${white}"]`,
    '[Black "Bob"]',
    `[Result "${result}"]`,
    `[GameId "${gameId}"]`,
    `[UTCDate "${date}"]`,
    `[UTCTime "${time}"]`,
    `[TimeControl "${timeControl}"]`,
    "",
    `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 ${result}`,
    "",
  ].join("\n");
}

function requestAt(index: number): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`No request at index ${index}`);
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("gameSummaryFromPgn", () => {
  it("reads the headers, the result, the clock and the Site link", () => {
    const summary = gameSummaryFromPgn(samplePgn(), "lichess", "");

    expect(summary).toMatchObject({
      id: "abcd1234",
      source: "lichess",
      white: "Alice",
      black: "Bob",
      result: "white",
      timeControl: "180+2",
      speed: "blitz",
      url: "https://lichess.org/abcd1234",
    });
    expect(summary?.playedAt?.toISOString()).toBe("2026-11-25T10:00:00.000Z");
    expect(summary?.pgn).toContain("1. e4 e5");
  });

  it("honours an explicit id, url and API speed, and ignores non-chess sites", () => {
    const summary = gameSummaryFromPgn(
      samplePgn(),
      "pgn",
      "local-id",
      "https://example.com/watch",
      "bullet"
    );
    expect(summary).toMatchObject({
      id: "local-id",
      source: "pgn",
      speed: "bullet",
      url: "https://example.com/watch",
    });

    const elsewhere = gameSummaryFromPgn(
      samplePgn({ site: "https://example.com/abcd1234" }),
      "lichess",
      ""
    );
    expect(elsewhere?.url).toBeNull();
  });

  it("returns null when there is no game to parse", () => {
    expect(gameSummaryFromPgn("not a pgn", "pgn", "id")).toBeNull();
    expect(
      gameSummaryFromPgn('[White "Alice"]\n[Black "Bob"]\n\n*', "pgn", "id")
    ).toMatchObject({ white: "Alice", black: "Bob", result: "unknown" });
  });
});

describe("fetchLichessGames", () => {
  it("requests the 30-day PGN window and returns games newest first", async () => {
    const older = samplePgn({
      site: "https://lichess.org/older123",
      date: "2026.11.24",
      white: "Carol",
    });
    const newer = samplePgn({
      site: "https://lichess.org/newest12",
      date: "2026.11.25",
      time: "11:00:00",
    });
    fetchMock.mockResolvedValue(new Response(`${older}\n\n${newer}\n\n`));

    const games = await fetchLichessGames("alice");

    expect(games.map((game) => game.id)).toEqual(["newest12", "older123"]);
    expect(games[0]?.white).toBe("Alice");
    const { url, init } = requestAt(0);
    expect(url).toBe(
      `https://lichess.org/api/games/user/alice?max=${MAX_GAMES}&since=${NOW.getTime() - GAME_WINDOW_DAYS * DAY_MS}&until=${NOW.getTime()}&ongoing=true`
    );
    expect(init.headers).toMatchObject({
      Accept: "application/x-chess-pgn",
      "User-Agent": "OmniBot https://github.com/RedsTom/OmniBot",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("marks ongoing Lichess games and builds their watch URL", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        samplePgn({ result: "*", site: "https://lichess.org/live1234" })
      )
    );

    const games = await fetchLichessGames("alice");

    expect(games[0]).toMatchObject({
      id: "live1234",
      ongoing: true,
      url: "https://lichess.org/live1234",
      result: "unknown",
    });
  });

  it("does not offer to watch aborted or never-started games", async () => {
    for (const termination of ["Aborted", "No start"]) {
      fetchMock.mockResolvedValue(
        new Response(
          samplePgn({
            result: "*",
            site: "https://lichess.org/abort123",
          }).replace(
            '[Result "*"]',
            `[Termination "${termination}"]\n[Result "*"]`
          )
        )
      );

      const games = await fetchLichessGames("alice");
      expect(games[0]).toMatchObject({ id: "abort123", result: "unknown" });
      expect(games[0]?.ongoing).toBeUndefined();
    }
  });

  it("keeps the later game when an earlier block has headers but no moves", async () => {
    const headerOnly = [
      '[Event "Rated game"]',
      '[Site "https://lichess.org/first123"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      '[Result "*"]',
    ].join("\n");
    fetchMock.mockResolvedValue(
      new Response(
        `${headerOnly}\n${samplePgn({
          site: "https://lichess.org/second12",
          gameId: "second12",
        })}`
      )
    );

    const games = await fetchLichessGames("alice");
    expect(games.map((game) => game.id)).toContain("second12");
  });

  it("uses the current GameId header returned by the Lichess PGN export", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        samplePgn({
          site: "https://lichess.org/game/newest12",
          gameId: "newest12",
        })
      )
    );

    const games = await fetchLichessGames("alice");
    expect(games[0]).toMatchObject({
      id: "newest12",
      url: "https://lichess.org/game/newest12",
    });
  });

  it("splits games separated by a single newline and stops at 50 games", async () => {
    const blocks = Array.from({ length: MAX_GAMES + 1 }, (_, index) =>
      samplePgn({
        site: `https://lichess.org/game${String(index).padStart(4, "0")}`,
      })
    );
    fetchMock.mockResolvedValue(new Response(blocks.join("\n")));

    const games = await fetchLichessGames("alice");

    expect(games).toHaveLength(MAX_GAMES);
    expect(games[0]?.id).toBe("game0000");
    expect(games.some((game) => game.id === "game0050")).toBe(false);
  });

  it("throws on an HTTP error", async () => {
    fetchMock.mockResolvedValue(
      new Response("nope", { status: 503, statusText: "Service Unavailable" })
    );
    await expect(fetchLichessGames("alice")).rejects.toThrow(
      /503 Service Unavailable/
    );
  });
});

describe("fetchChesscomGames", () => {
  it("fetches only the intersecting months and filters by end_time", async () => {
    const archiveUrl = (month: string) =>
      `https://api.chess.com/pub/player/alice/games/archives/${month}`;
    const older = {
      game_id: 1,
      url: "https://www.chess.com/game/live/1?username=alice",
      pgn: samplePgn({
        site: "https://www.chess.com/game/live/1",
        date: "2026.11.24",
      }),
      end_time: Math.floor(new Date("2026-11-24T10:00:00Z").getTime() / 1000),
      time_class: "rapid",
      time_control: "10+5",
    };
    const newer = {
      game_id: 2,
      url: "https://www.chess.com/game/live/2?username=alice",
      pgn: samplePgn({
        site: "https://www.chess.com/game/live/2",
        date: "2026.11.25",
      }),
      end_time: Math.floor(new Date("2026-11-25T11:00:00Z").getTime() / 1000),
      time_class: "blitz",
      time_control: "3+2",
    };
    const tooOld = {
      game_id: 3,
      pgn: samplePgn({ date: "2026.09.01" }),
      end_time: Math.floor(new Date("2026-09-01T10:00:00Z").getTime() / 1000),
    };

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.chess.com/pub/player/alice/games?v=")) {
        return new Response(JSON.stringify({ games: [] }));
      }
      if (url.endsWith("/games/archives")) {
        return new Response(
          JSON.stringify({
            archives: [
              archiveUrl("2026/11"),
              archiveUrl("2026/10"),
              archiveUrl("2026/09"),
            ],
          })
        );
      }
      if (url === archiveUrl("2026/11")) {
        return new Response(JSON.stringify({ games: [older, newer, tooOld] }));
      }
      if (url === archiveUrl("2026/10"))
        return new Response(JSON.stringify({ games: [] }));
      throw new Error(`Unexpected URL: ${url}`);
    });

    const games = await fetchChesscomGames("alice");

    expect(games.map((game) => game.id)).toEqual(["2", "1"]);
    expect(games.map((game) => game.timeControl)).toEqual(["3+2", "10+5"]);
    expect(games.map((game) => game.speed)).toEqual(["blitz", "courte"]);
    expect(games[0]?.url).toBe(newer.url);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("lists ongoing Chess.com daily games before finished ones", async () => {
    const ongoing = {
      url: "https://www.chess.com/game/daily/424242",
      pgn: '[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n[TimeControl "1/259200"]\n\n1. e4 e5 *',
      time_control: "1/259200",
      time_class: "daily",
    };
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.chess.com/pub/player/alice/games?v=")) {
        return new Response(JSON.stringify({ games: [ongoing] }));
      }
      if (url.endsWith("/games/archives")) {
        return new Response(JSON.stringify({ archives: [] }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const games = await fetchChesscomGames("alice");

    expect(games[0]).toMatchObject({
      id: "424242",
      ongoing: true,
      url: ongoing.url,
      timeControl: "259200",
      result: "unknown",
    });
  });
});

describe("fetchGameFromUrl", () => {
  it("exports a Lichess game by id, ignoring the color suffix", async () => {
    fetchMock.mockResolvedValue(new Response(samplePgn()));

    const summary = await fetchGameFromUrl(
      "https://lichess.org/abcd1234/black"
    );

    expect(summary).toMatchObject({
      id: "abcd1234",
      source: "url",
      url: "https://lichess.org/abcd1234/black",
      white: "Alice",
    });
    expect(requestAt(0).url).toBe("https://lichess.org/game/export/abcd1234");
  });

  it("reads the current /game/{id} Lichess URL", async () => {
    fetchMock.mockResolvedValue(new Response(samplePgn()));

    const summary = await fetchGameFromUrl(
      "https://lichess.org/game/abcd1234/black"
    );

    expect(summary?.id).toBe("abcd1234");
    expect(requestAt(0).url).toBe("https://lichess.org/game/export/abcd1234");
  });

  it("reads a Lichess export URL", async () => {
    fetchMock.mockResolvedValue(new Response(samplePgn()));

    const summary = await fetchGameFromUrl(
      "https://lichess.org/game/export/abcd1234"
    );

    expect(summary?.id).toBe("abcd1234");
    expect(requestAt(0).url).toBe("https://lichess.org/game/export/abcd1234");
  });

  it("sends a short Lichess id straight to the API instead of prechecking it", async () => {
    fetchMock.mockResolvedValue(new Response(samplePgn()));

    const summary = await fetchGameFromUrl("https://lichess.org/8fuPHGyu");

    expect(summary?.id).toBe("8fuPHGyu");
    expect(requestAt(0).url).toBe("https://lichess.org/game/export/8fuPHGyu");
  });

  it("uses the game id of a 12-character Lichess full URL", async () => {
    fetchMock.mockResolvedValue(new Response(samplePgn()));
    const url = "https://lichess.org/game/f7hLkfTQ1uLb";

    const summary = await fetchGameFromUrl(url);

    expect(summary).toMatchObject({ id: "f7hLkfTQ", url });
    expect(requestAt(0).url).toBe("https://lichess.org/game/export/f7hLkfTQ");
  });

  it("resolves a Chess.com live game through its callback and monthly archive", async () => {
    const url = "https://www.chess.com/game/live/12345?username=hikaru";
    fetchMock.mockImplementation(async (input) => {
      const requested = String(input);
      if (requested === "https://www.chess.com/callback/live/game/12345") {
        return new Response(
          JSON.stringify({
            game: {
              pgnHeaders: {
                White: "Hikaru",
                Black: "tactic",
                Date: "2026.05.17",
              },
            },
          })
        );
      }
      if (
        requested === "https://api.chess.com/pub/player/hikaru/games/2026/05"
      ) {
        return new Response(
          JSON.stringify({
            games: [
              {
                url: "https://www.chess.com/game/live/12345",
                pgn: samplePgn({ site: url }),
                time_class: "blitz",
              },
              {
                url: "https://www.chess.com/game/live/99999",
                pgn: samplePgn(),
              },
            ],
          })
        );
      }
      throw new Error(`Unexpected URL: ${requested}`);
    });

    const summary = await fetchGameFromUrl(url);

    expect(summary).toMatchObject({
      id: "12345",
      source: "url",
      url,
      white: "Alice",
      speed: "blitz",
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "https://www.chess.com/callback/live/game/12345",
      "https://api.chess.com/pub/player/hikaru/games/2026/05",
    ]);
  });

  it("resolves a Chess.com daily game too", async () => {
    const url = "https://www.chess.com/game/daily/947761777";
    fetchMock.mockImplementation(async (input) => {
      const requested = String(input);
      if (requested === "https://www.chess.com/callback/daily/game/947761777") {
        return new Response(
          JSON.stringify({
            game: {
              pgnHeaders: { White: "Alice", Date: "2026.03.21" },
              // A daily game started in March but finished in April.
              endTime: new Date("2026-04-04T00:00:00Z").getTime() / 1000,
            },
          })
        );
      }
      if (
        requested === "https://api.chess.com/pub/player/alice/games/2026/04"
      ) {
        return new Response(
          JSON.stringify({
            games: [
              {
                url,
                pgn: samplePgn({ site: url }),
                time_class: "daily",
              },
            ],
          })
        );
      }
      throw new Error(`Unexpected URL: ${requested}`);
    });

    const summary = await fetchGameFromUrl(url);

    expect(summary?.id).toBe("947761777");
    expect(requestAt(0).url).toBe(
      "https://www.chess.com/callback/daily/game/947761777"
    );
  });

  it("reports a clear error when the archive has no matching PGN", async () => {
    fetchMock.mockImplementation(async (input) => {
      const requested = String(input);
      if (requested === "https://www.chess.com/callback/live/game/12345") {
        return new Response(
          JSON.stringify({
            game: { pgnHeaders: { White: "Alice", Date: "2026.11.25" } },
          })
        );
      }
      return new Response(JSON.stringify({ games: [] }));
    });
    await expect(
      fetchGameFromUrl("https://www.chess.com/game/live/12345")
    ).rejects.toThrow(/No PGN found/);
  });

  it("rejects malformed URLs and unsupported hosts before fetching", async () => {
    await expect(fetchGameFromUrl("not a url")).rejects.toThrow(
      /Invalid game URL/
    );
    await expect(
      fetchGameFromUrl("http://lichess.org/abcd1234")
    ).rejects.toThrow(/Unsupported game URL/);
    await expect(
      fetchGameFromUrl("ftp://lichess.org/abcd1234")
    ).rejects.toThrow(/Unsupported game URL/);
    await expect(fetchGameFromUrl("https://lichess.org/")).rejects.toThrow(
      /Unsupported Lichess game URL/
    );
    await expect(
      fetchGameFromUrl("https://lichess.org/tournament/abc12345")
    ).rejects.toThrow(/Unsupported Lichess game URL/);
    await expect(
      fetchGameFromUrl("https://lichess.org/@/alice")
    ).rejects.toThrow(/Unsupported Lichess game URL/);
    await expect(
      fetchGameFromUrl("https://www.chess.com/game/blitz/12345")
    ).rejects.toThrow(/Unsupported Chess.com game URL/);
    await expect(
      fetchGameFromUrl("https://example.com/game/12345")
    ).rejects.toThrow(/Unsupported game URL host/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
