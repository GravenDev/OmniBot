export type Speed = "bullet" | "blitz" | "courte" | "rapide" | "classique";

const API_SPEEDS: Record<string, Speed> = {
  bullet: "bullet",
  blitz: "blitz",
  rapid: "courte",
  classical: "classique",
  daily: "classique",
};

/** Seconds of the base clock, or -1 when the tag is absent. */
export function baseSeconds(timeControl: string): number {
  const base = Number(timeControl.split("+")[0] ?? "");
  return Number.isFinite(base) && base > 0 ? base : -1;
}

/**
 * `3+2` is a Blitz, `10+5` a Courte: the French labels follow the base
 * clock, the increment only refines very short games.
 */
export function speedOf(timeControl: string, apiSpeed?: string): Speed {
  const fromApi = apiSpeed ? API_SPEEDS[apiSpeed.toLowerCase()] : undefined;
  if (fromApi) return fromApi;

  const base = baseSeconds(timeControl);
  if (base < 0) return "classique";
  if (base < 120) return "bullet";
  if (base < 480) return "blitz";
  if (base < 1500) return "courte";
  if (base < 3600) return "rapide";
  return "classique";
}

export function formatTimeControl(timeControl: string): string {
  const [rawBase, rawIncrement] = timeControl.split("+");
  const base = Number(rawBase ?? "");
  const increment = Number(rawIncrement ?? 0);
  if (!Number.isFinite(base) || base <= 0) return timeControl || "?";
  const minutes = Math.round(base / 60);
  return increment > 0 ? `${minutes}+${increment}` : `${minutes}`;
}
