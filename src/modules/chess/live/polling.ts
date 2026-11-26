import { speedOf } from "../speed.js";
import type { LiveSource } from "./types.js";

/**
 * Chess.com's live feed is the callback its own web client reads, not its
 * public API: it is read at most every 15 seconds.
 */
const CHESSCOM_MIN_INTERVAL_MS = 15_000;

/** The faster the clock, the more often the feed is checked. */
export function pollInterval(
  timeControl: string,
  source: LiveSource = "lichess"
): number {
  const speed = speedOf(timeControl);
  let interval = 30_000;
  if (speed === "bullet" || speed === "blitz") interval = 5_000;
  else if (speed === "courte" || speed === "rapide") interval = 10_000;
  return source === "chesscom"
    ? Math.max(interval, CHESSCOM_MIN_INTERVAL_MS)
    : interval;
}
