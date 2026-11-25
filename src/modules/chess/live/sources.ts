import { parsePgn } from "chessops/pgn";
import {
  chesscomTimeControl,
  fetchChesscomCurrentGames,
  fetchJson,
  fetchText,
  gameSummaryFromPgn,
  parseGameUrl,
} from "../games/fetch.js";
import { resultFromTag } from "../games/pgn.js";
import type { GameResult } from "../types.js";
import { sanToUci } from "./moves.js";
import { decodeTcn } from "./tcn.js";
import type { LiveSource } from "./types.js";

export interface LiveSnapshot {
  source: LiveSource;
  gameId: string;
  url: string;
  white: string;
  black: string;
  timeControl: string;
  /** UCI moves, in the order they were played. */
  moves: string[];
  /** Non-standard starting position, needed to replay those UCI moves. */
  startFen?: string | undefined;
  finished: boolean;
  /** Only set once the feed reports the game over; never stored in the DB. */
  result: GameResult;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function sansFromPgn(pgn: string): string[] {
  const game = parsePgn(pgn)[0];
  return game ? Array.from(game.moves.mainline(), (node) => node.san) : [];
}

function fenFromPgn(pgn: string): string | undefined {
  return parsePgn(pgn)[0]?.headers.get("FEN") || undefined;
}

/** Public, no auth: returns the ongoing game or the player's last one. */
export async function findLichessGame(
  username: string
): Promise<LiveSnapshot | null> {
  const data = object(
    await fetchJson(
      `https://lichess.org/api/user/${encodeURIComponent(username)}/current-game?v=${Date.now()}`
    )
  );
  if (data?.["status"] !== "started") return null;
  const id = text(data["id"]);
  if (!id) return null;
  // The current-game endpoint gives the position *after* the moves played.
  // The export carries the FEN header a From Position game starts from, so
  // the two feeds must not be mixed when building the board.
  return lichessGameById(id, `https://lichess.org/${id}`);
}

export async function lichessGameById(
  id: string,
  url: string
): Promise<LiveSnapshot | null> {
  const pgn = await fetchText(
    `https://lichess.org/game/export/${encodeURIComponent(id)}?v=${Date.now()}`,
    { Accept: "application/x-chess-pgn" }
  );
  const summary = gameSummaryFromPgn(pgn, "lichess", id, url);
  const startFen = fenFromPgn(pgn);
  const moves = sanToUci(sansFromPgn(pgn), startFen);
  if (!summary || !moves) return null;
  const terminated = /^\[Termination "(?:Aborted|No start)"\]/im.test(pgn);
  return {
    source: "lichess",
    gameId: id,
    url,
    white: summary.white,
    black: summary.black,
    timeControl: summary.timeControl,
    moves,
    startFen,
    finished: terminated || summary.result !== "unknown",
    result: terminated ? "unknown" : summary.result,
  };
}

/** Chess.com publishes only ongoing daily games by username, not live ones. */
export async function findChesscomGame(
  username: string
): Promise<LiveSnapshot | null> {
  for (const game of await fetchChesscomCurrentGames(username)) {
    const startFen = fenFromPgn(game.pgn);
    const moves = sanToUci(sansFromPgn(game.pgn), startFen);
    if (!game.url || !moves) continue;
    return {
      source: "chesscom",
      gameId: game.id,
      url: game.url,
      white: game.white,
      black: game.black,
      timeControl: game.timeControl,
      moves,
      startFen,
      finished: false,
      result: "unknown",
    };
  }
  return null;
}

function callbackKind(url: string): "live" | "daily" {
  try {
    return parseGameUrl(url).kind ?? "live";
  } catch {
    return "live";
  }
}

export async function chesscomGameById(
  id: string,
  url: string
): Promise<LiveSnapshot | null> {
  const data = object(
    await fetchJson(
      `https://www.chess.com/callback/${callbackKind(url)}/game/${id}?v=${Date.now()}`
    )
  );
  const game = object(data?.["game"]);
  const headers = object(game?.["pgnHeaders"]);
  const white = text(headers?.["White"]);
  const black = text(headers?.["Black"]);
  const moves = decodeTcn(text(game?.["moveList"]) ?? "");
  if (!white || !black || !moves) return null;
  const rawControl = text(headers?.["TimeControl"]) ?? "";
  return {
    source: "chesscom",
    gameId: id,
    url,
    white,
    black,
    timeControl: chesscomTimeControl(rawControl),
    moves,
    finished: game?.["isFinished"] === true,
    result: resultFromTag(text(headers?.["Result"]) ?? undefined),
  };
}

/** Resumes a stored watch, including Chess.com daily games. */
export async function refreshGame(
  game: Pick<LiveSnapshot, "source" | "gameId" | "url" | "white">
): Promise<LiveSnapshot | null> {
  return game.source === "lichess"
    ? lichessGameById(game.gameId, game.url)
    : chesscomGameById(game.gameId, game.url);
}

export async function gameFromUrl(url: string): Promise<LiveSnapshot | null> {
  const parsed = parseGameUrl(url);
  return parsed.source === "lichess"
    ? lichessGameById(parsed.id, url)
    : chesscomGameById(parsed.id, url);
}

export async function gameFromUsername(
  source: LiveSource,
  username: string
): Promise<LiveSnapshot | null> {
  return source === "lichess"
    ? findLichessGame(username)
    : findChesscomGame(username);
}
