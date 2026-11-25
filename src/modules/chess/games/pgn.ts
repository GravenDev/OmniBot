import type { Chess, NormalMove } from "chessops";
import { makeFen } from "chessops/fen";
import { parsePgn, startingPosition } from "chessops/pgn";
import { makeSanAndPlay, parseSan } from "chessops/san";
import type { GameResult, ParsedGame, Step } from "../types.js";

export function resultFromTag(result: string | undefined): GameResult {
  if (result === "1-0") return "white";
  if (result === "0-1") return "black";
  if (result === "1/2-1/2") return "draw";
  return "unknown";
}

export function dateFromHeaders(headers: Map<string, string>): Date | null {
  const date = (
    headers.get("UTCDate") ??
    headers.get("Date") ??
    headers.get("EndDate")
  )?.replaceAll(".", "-");
  const time = headers.get("UTCTime");
  if (!date) return null;
  const parsed = new Date(`${date}T${time ?? "00:00:00"}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Parses the first game of a PGN, keeping one position per ply. */
export function parseGame(pgn: string): ParsedGame | null {
  // chessops fills in default headers even for free text: check the source
  // itself so a random sentence is not mistaken for a game.
  if (!pgn.trimStart().startsWith("[") && !/\b[1-9]\./.test(pgn)) return null;
  try {
    const game = parsePgn(pgn)[0];
    if (!game) return null;

    const position = startingPosition(game.headers).unwrap() as Chess;
    const positions: Chess[] = [position.clone()];
    const steps: Step[] = [];

    for (const node of game.moves.mainline()) {
      const before = position.clone();
      const move = parseSan(position, node.san);
      // A bad move means this is not a game we can show or analyse: stopping
      // here would silently analyse a shorter, different game.
      if (!move || !("from" in move)) return null;

      const normal = move as NormalMove;
      const san = makeSanAndPlay(position, normal);
      steps.push({
        san,
        from: normal.from,
        to: normal.to,
        color:
          String(before.turn) === "w" || String(before.turn) === "white"
            ? "white"
            : "black",
        fenBefore: makeFen(before.toSetup()),
        fenAfter: makeFen(position.toSetup()),
        move: normal,
      });
      positions.push(position.clone());
    }

    // An abandoned game can have no move yet: keep its starting position so
    // the board (and a future live view) still has something to display. A
    // text with neither headers nor moves is not a game at all.
    if (game.headers.size === 0 && steps.length === 0) return null;
    return {
      headers: game.headers,
      positions,
      steps,
      result: resultFromTag(game.headers.get("Result")),
    };
  } catch {
    return null;
  }
}
