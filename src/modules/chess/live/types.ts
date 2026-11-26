import type { GameResult } from "../types.js";

export type LiveSource = "lichess" | "chesscom";

/** One followed game, as stored in the database and shown in its message. */
export interface LiveGame {
  id: string;
  source: LiveSource;
  gameId: string;
  url: string;
  guildId: string;
  channelId: string;
  messageId: string;
  ownerId: string;
  white: string;
  black: string;
  timeControl: string;
  /** The requested player (when watching a username) is drawn at the bottom. */
  flipped: boolean;
  /** UCI moves, as published by the live feed. */
  moves: string[];
  /** Non-standard starting position (Lichess "From Position", Chess960). */
  startFen?: string | undefined;
  ply: number;
  finished: boolean;
  result: GameResult;
}

export type LiveAction = "first" | "prev" | "next" | "last";

export function livePly(
  total: number,
  ply: number,
  action: LiveAction
): number {
  if (action === "first") return 0;
  if (action === "last") return total;
  if (action === "prev") return Math.max(0, ply - 1);
  return Math.min(total, ply + 1);
}
