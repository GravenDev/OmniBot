import { speedOf } from "../speed.js";

/** The faster the clock, the more often the feed is checked. */
export function pollInterval(timeControl: string): number {
  const speed = speedOf(timeControl);
  if (speed === "bullet" || speed === "blitz") return 5_000;
  if (speed === "courte" || speed === "rapide") return 10_000;
  return 30_000;
}
