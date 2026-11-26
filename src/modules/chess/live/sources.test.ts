import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchChesscomCurrentGames } from "../games/fetch.js";
import type { GameSummary } from "../types.js";
import {
  chesscomGameById,
  findLichessGame,
  gameFromUsername,
} from "./sources.js";

vi.mock("../games/fetch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../games/fetch.js")>();
  return {
    ...actual,
    fetchChesscomCurrentGames: vi.fn(),
  };
});
const json = vi.hoisted(() => vi.fn());
const text = vi.hoisted(() => vi.fn());
vi.mock("../services/site-requests.service.js", () => ({
  default: { json, text },
}));

const currentGames = vi.mocked(fetchChesscomCurrentGames);

function pgn(fen?: string): string {
  return [
    '[Event "Rated game"]',
    '[Site "https://lichess.org/SVnUTqu5"]',
    '[White "Alice"]',
    '[Black "Bob"]',
    '[Result "*"]',
    '[TimeControl "180+0"]',
    ...(fen ? [`[FEN "${fen}"]`] : []),
    "",
    "1. e4 e5 *",
  ].join("\n");
}

beforeEach(() => {
  json.mockReset();
  text.mockReset();
  currentGames.mockReset();
});

describe("live sources", () => {
  it("reads a Lichess player's game in progress", async () => {
    json.mockResolvedValue({
      id: "SVnUTqu5",
      status: "started",
      speed: "blitz",
      clock: { initial: 180, increment: 0 },
      players: {
        white: { user: { name: "Alice" } },
        black: { user: { name: "Bob" } },
      },
      moves: "e4 e5",
    });
    text.mockResolvedValue(pgn());

    expect(await findLichessGame("Bob")).toMatchObject({
      source: "lichess",
      gameId: "SVnUTqu5",
      white: "Alice",
      black: "Bob",
      timeControl: "180+0",
      moves: ["e2e4", "e7e5"],
      finished: false,
      result: "unknown",
    });
  });

  it("replays a From Position game from its starting FEN", async () => {
    const fen = "4k3/8/8/8/8/4P3/8/4K3 w - - 0 1";
    json.mockResolvedValue({ id: "SVnUTqu5", status: "started" });
    text.mockResolvedValue(
      [
        '[Event "Rated game"]',
        '[Site "https://lichess.org/SVnUTqu5"]',
        '[White "Alice"]',
        '[Black "Bob"]',
        '[Result "*"]',
        `[FEN "${fen}"]`,
        "",
        "1. e4 *",
      ].join("\n")
    );

    expect(await findLichessGame("Bob")).toMatchObject({
      startFen: fen,
      moves: ["e3e4"],
    });
  });

  it("ignores a Lichess player who is not playing", async () => {
    json.mockResolvedValue({ id: "old", status: "aborted" });
    expect(await findLichessGame("Nobody")).toBeNull();
  });

  it("reads an ongoing Chess.com daily game from the shared list", async () => {
    const ongoing: GameSummary = {
      id: "1009978778",
      source: "chesscom",
      white: "Alice",
      black: "Bob",
      result: "unknown",
      timeControl: "259200",
      speed: "classique",
      playedAt: null,
      url: "https://www.chess.com/game/daily/1009978778",
      pgn: '[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n[TimeControl "1/259200"]\n\n1. e4 e5 *',
      ongoing: true,
    };
    currentGames.mockResolvedValue([ongoing]);

    const snapshot = await gameFromUsername("chesscom", "Alice");
    expect(snapshot).toMatchObject({
      source: "chesscom",
      gameId: "1009978778",
      timeControl: "259200",
      moves: ["e2e4", "e7e5"],
    });
  });

  it("uses the daily callback for a Chess.com daily URL", async () => {
    json.mockResolvedValue({
      game: {
        isFinished: false,
        moveList: "gv",
        pgnHeaders: {
          White: "Alice",
          Black: "Bob",
          TimeControl: "1/259200",
        },
      },
    });

    const snapshot = await chesscomGameById(
      "1009978778",
      "https://www.chess.com/game/daily/1009978778"
    );

    expect(json).toHaveBeenCalledWith(
      expect.stringContaining("/callback/daily/game/1009978778")
    );
    expect(snapshot).toMatchObject({
      source: "chesscom",
      white: "Alice",
      black: "Bob",
      timeControl: "259200",
      moves: ["g1f3"],
      finished: false,
      result: "unknown",
    });
  });

  it("reads the result of a finished Chess.com game", async () => {
    json.mockResolvedValue({
      game: {
        isFinished: true,
        moveList: "gv",
        pgnHeaders: {
          White: "Alice",
          Black: "Bob",
          Result: "0-1",
          TimeControl: "180+0",
        },
      },
    });

    const snapshot = await chesscomGameById(
      "12345",
      "https://www.chess.com/game/live/12345"
    );

    expect(snapshot).toMatchObject({ finished: true, result: "black" });
  });

  it("replays a Chess960 Chess.com game from its starting FEN", async () => {
    const fen = "bnrqkrnb/pppppppp/8/8/8/8/PPPPPPPP/BNRQKRNB w KQkq - 0 1";
    json.mockResolvedValue({
      game: {
        isFinished: false,
        moveList: "gv",
        pgnHeaders: {
          White: "Alice",
          Black: "Bob",
          TimeControl: "600",
          Variant: "Chess960",
          SetUp: "1",
          FEN: fen,
        },
      },
    });

    const snapshot = await chesscomGameById(
      "1",
      "https://www.chess.com/game/live/1"
    );

    expect(snapshot?.startFen).toBe(fen);
  });

  it("leaves out a Chess.com variant the board cannot replay", async () => {
    json.mockResolvedValue({
      game: {
        isFinished: false,
        moveList: "gv",
        pgnHeaders: {
          White: "Alice",
          Black: "Bob",
          TimeControl: "600",
          Variant: "King of the Hill",
        },
      },
    });

    expect(
      await chesscomGameById("1", "https://www.chess.com/game/live/1")
    ).toBeNull();
  });
});
