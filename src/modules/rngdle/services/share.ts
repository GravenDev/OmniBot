import { TIERS, type Tier } from "./scoring.js";

export interface SharedBadge {
  emoji: string;
  label: string;
  tier: Tier | null;
}

export interface Placement {
  top: boolean;
  percent: number;
}

export interface SharedRoll {
  number: number;
  score: number;
  tier: Tier | null;
  placement: Placement | null;
  badges: SharedBadge[];
  hiddenBadges: number;
}

const MAX_NUMBER = 1_000_000;
const HEADER = /^[^\S\n]*RNGdle[^\S\n]*🎲[^\S\n]*(\d[\d   ,.]*)$/imu;
const SCORE = /^[^\S\n]*(\d[\d   ,.]*)EP[^\S\n]*$/imu;
const TIER_LINE = new RegExp(
  String.raw`^\s*\S+\s+(${TIERS.join("|")})\b.*•`,
  "iu"
);
const PLACEMENT = /\b(top|bottom)\s+(\d+(?:[.,]\d+)?)\s*%/iu;
const BADGE_LINE = /^\s*([🟥🟧🟨🟩🟦🟪🟫⬛⬜])\u{FE0F}?\s+(\S+)\s+(.+?)\s*$/u;
const MORE_LINE = /^\s*\+\s*(\d+)\s+more\s*$/iu;

const SQUARE_TIERS: Record<string, Tier> = {
  "🟥": "TRASH",
  "⬜": "COMMON",
  "🟩": "UNCOMMON",
  "🟦": "RARE",
  "🟪": "EPIC",
  "🟧": "ANOMALY",
};

function parseInteger(text: string): number {
  return Number(text.replace(/[\s,.]/g, ""));
}

function parsePlacement(line: string): Placement | null {
  const found = PLACEMENT.exec(line);
  return found
    ? {
        top: found[1]!.toLowerCase() === "top",
        percent: Number(found[2]!.replace(",", ".")),
      }
    : null;
}

export function parseShare(content: string): SharedRoll | null {
  const header = HEADER.exec(content);
  const score = SCORE.exec(content);
  if (!header || !score) {
    return null;
  }
  const number = parseInteger(header[1]!);
  const total = parseInteger(score[1]!);
  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > MAX_NUMBER ||
    !Number.isSafeInteger(total)
  ) {
    return null;
  }

  let tier: Tier | null = null;
  let placement: Placement | null = null;
  const badges: SharedBadge[] = [];
  let hiddenBadges = 0;
  for (const line of content.slice(header.index).split("\n")) {
    const tierLine = TIER_LINE.exec(line);
    if (tierLine) {
      tier = tierLine[1]!.toUpperCase() as Tier;
      placement = parsePlacement(line);
      continue;
    }
    const more = MORE_LINE.exec(line);
    if (more) {
      hiddenBadges = Number(more[1]);
      continue;
    }
    const badge = BADGE_LINE.exec(line);
    if (badge) {
      badges.push({
        emoji: badge[2]!,
        label: badge[3]!,
        tier: SQUARE_TIERS[badge[1]!] ?? null,
      });
    }
  }

  return { number, score: total, tier, placement, badges, hiddenBadges };
}
