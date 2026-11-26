import { Chess, type NormalMove, parseUci } from "chessops";
import { makeFen, parseFen } from "chessops/fen";
import { startingPosition } from "chessops/pgn";
import { makeSanAndPlay, parseSan } from "chessops/san";
import type { ParsedGame, Step } from "../types.js";

/**
 * Live feeds publish UCI moves, not SAN. Rebuild the very same `ParsedGame`
 * the PGN reader produces so the board, the navigation and the move list all
 * share one representation.
 */
export function gameFromUci(
  moves: string[],
  headers: Map<string, string> = new Map()
): ParsedGame | null {
  let position: Chess;
  try {
    position = startingPosition(headers).unwrap() as Chess;
  } catch {
    return null;
  }

  const positions: Chess[] = [position.clone()];
  const steps: Step[] = [];
  for (const uci of moves) {
    const move = parseUci(uci.trim());
    // A null move ("0000") has no origin square: ignore it rather than drop
    // the whole game because a feed sent one.
    if (!move || !("from" in move)) continue;
    const before = position.clone();
    const normal = move as NormalMove;
    if (!position.isLegal(normal)) return null;
    const san = makeSanAndPlay(position, normal);
    if (!san) return null;

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

  // Live watches only follow standard games: the feeds refuse variants.
  return { headers, variant: "chess", positions, steps, result: "unknown" };
}

const PROMOTIONS: Record<string, string> = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
};

function squareName(square: number): string {
  return `${"abcdefgh"[square % 8]}${Math.floor(square / 8) + 1}`;
}

function uciOf(move: NormalMove): string {
  const promotion = move.promotion ? (PROMOTIONS[move.promotion] ?? "") : "";
  return `${squareName(move.from)}${squareName(move.to)}${promotion}`;
}

/**
 * Lichess's current-game endpoint and Chess.com's daily PGNs publish SAN.
 * Store UCI instead so every source feeds the same board renderer.
 */
export function sanToUci(sans: string[], fen?: string): string[] | null {
  let position: Chess;
  try {
    position = fen
      ? Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
      : (startingPosition(new Map()).unwrap() as Chess);
  } catch {
    return null;
  }

  const ucis: string[] = [];
  for (const san of sans) {
    const move = parseSan(position, san.trim());
    if (!move || !("from" in move)) return null;
    ucis.push(uciOf(move as NormalMove));
    position.play(move);
  }
  return ucis;
}

export const LIVE_MOVE_LINES = 8;

/**
 * The last eight rounds, one per line, like a PGN score sheet: `4. e4 e5`.
 * An unfinished round shows `--` for the move not played yet. Older rounds
 * scroll away instead of growing the message forever.
 */
export function moveNotation(
  steps: Step[],
  ply: number,
  lines = LIVE_MOVE_LINES
): string {
  const played = Math.min(ply, steps.length);
  const lastRound = Math.ceil(played / 2);
  const firstRound = Math.max(1, lastRound - lines + 1);
  const rows: string[] = [];
  for (let round = firstRound; round <= lastRound; round++) {
    const whiteIndex = (round - 1) * 2;
    const white = whiteIndex < played ? steps[whiteIndex]?.san : undefined;
    const black =
      whiteIndex + 1 < played ? steps[whiteIndex + 1]?.san : undefined;
    rows.push(`${round}. ${white ?? "--"} ${black ?? "--"}`);
  }
  return rows.join("\n");
}
