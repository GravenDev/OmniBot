import type { Classification } from "wintrchess/classify";
import type { ChessSide, GameSummary } from "./types.js";

export const RATING_ASSETS: Record<Classification, string> = {
  brilliant: "brilliant",
  critical: "critical",
  best: "best",
  excellent: "excellent",
  okay: "good",
  inaccuracy: "inaccuracy",
  mistake: "mistake",
  blunder: "blunder",
  miss: "miss",
  theory: "book",
  forced: "forced",
  risky: "risky",
};

export const RATING_ORDER: Classification[] = [
  "brilliant",
  "critical",
  "best",
  "excellent",
  "okay",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
  "theory",
  "forced",
  "risky",
];

/**
 * The colour an account played in one game. Used for both the list outcomes
 * and the report side of username-based requests; null when the account is
 * unknown on that game (an imported PGN, for instance).
 */
export function playerSide(
  game: GameSummary,
  requestedPlayer?: string
): ChessSide | null {
  if (!requestedPlayer) return null;
  const requested = requestedPlayer.toLowerCase();
  if (game.white.toLowerCase() === requested) return "white";
  if (game.black.toLowerCase() === requested) return "black";
  return null;
}

/** Game outcomes from the point of view of the player being asked about. */
export const OUTCOME_EMOJI = {
  win: "✅",
  loss: "❌",
  draw: "🤝",
  unknown: "❔",
} as const;

export function ratingAsset(rating: Classification): string {
  return RATING_ASSETS[rating];
}
