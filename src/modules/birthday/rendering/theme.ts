import { festiveConfetti } from "#lib/celebration-card.js";
import type { Rgb } from "#lib/imaging.js";

export const ACCENT: Rgb = [255, 158, 196];
/** The accent, as Discord takes a container's colour. */
export const ACCENT_COLOR = (ACCENT[0] << 16) | (ACCENT[1] << 8) | ACCENT[2];
export const CONFETTI = festiveConfetti(ACCENT);
