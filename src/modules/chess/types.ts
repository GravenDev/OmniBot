import type { Chess, NormalMove, Square } from "chessops";
import type { Classification } from "wintrchess/classify";
import type { Evaluation } from "wintrchess/engine";
import type { Speed } from "./speed.js";

export type ChessSource = "lichess" | "chesscom" | "url" | "pgn";
export type ChessMode = "view" | "report" | "analyse";
export type ChessView = "board" | "analyse" | "report";
export type ChessSide = "white" | "black";
export type GameResult = "white" | "black" | "draw" | "unknown";

/** The tab a session opens on, before the member switches with the buttons. */
export function viewForMode(mode: ChessMode): ChessView {
  if (mode === "report") return "report";
  if (mode === "analyse") return "analyse";
  return "board";
}

export interface GameSummary {
  id: string;
  source: ChessSource;
  white: string;
  black: string;
  result: GameResult;
  timeControl: string;
  speed: Speed;
  playedAt: Date | null;
  url: string | null;
  pgn: string;
  /** Still running on the site: the list offers to watch it live. */
  ongoing?: boolean;
}

export interface Step {
  san: string;
  from: Square;
  to: Square;
  color: ChessSide;
  fenBefore: string;
  fenAfter: string;
  move: NormalMove;
}

export interface ParsedGame {
  headers: Map<string, string>;
  positions: Chess[];
  steps: Step[];
  result: GameResult;
}

export interface RatingCount {
  rating: Classification;
  count: number;
}

export interface GameAnalysis {
  accuracies: Record<ChessSide, number>;
  ratings: Classification[];
  /** White-relative evaluation of every position, including the final one. */
  evaluations: Evaluation[];
  counts: Record<ChessSide, RatingCount[]>;
}

export interface ChessSession {
  id: string;
  ownerId: string;
  mode: ChessMode;
  view: ChessView;
  side: ChessSide;
  games: GameSummary[];
  /** Username whose account supplied the list, when there is one. */
  requestedPlayer?: string;
  /** Index of the game currently parsed, for titles and reports. */
  gameIndex?: number;
  page: number;
  parsed?: ParsedGame;
  ply: number;
  flipped: boolean;
  analysis?: GameAnalysis;
  /** Shared by simultaneous button presses so the engine starts only once. */
  pendingAnalysis?: { readonly promise: Promise<GameAnalysis> };
  expiresAt: number;
}
