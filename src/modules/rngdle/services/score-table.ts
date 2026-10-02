import type { Rgb } from "#lib/imaging.js";

export const TIERS = [
  "TRASH",
  "COMMON",
  "UNCOMMON",
  "RARE",
  "EPIC",
  "ANOMALY",
  "MYTHIC",
] as const;

export type Tier = (typeof TIERS)[number];

export type TierOrError = Tier | "ERROR";

export const TIER_COLORS: Record<TierOrError, Rgb> = {
  TRASH: [229, 126, 98],
  COMMON: [229, 231, 235],
  UNCOMMON: [94, 233, 181],
  RARE: [142, 197, 255],
  EPIC: [218, 178, 255],
  ANOMALY: [255, 137, 4],
  MYTHIC: [253, 165, 213],
  ERROR: [255, 41, 41],
};

export type CompressedTable = Record<string, number>;

const TABLE_START =
  /\{(?:0x[0-9a-fA-F]+|\d+(?:e\d+)?)\s*:\s*(?:\d+(?:\.\d+)?|\.\d+)\s*[,}]/g;
const TABLE_ENTRY =
  /(0x[0-9a-fA-F]+|\d+(?:e\d+)?)\s*:\s*(\d+(?:\.\d+)?|\.\d+)\s*(,\s*|\})/y;

const MIN_TABLE_ENTRIES = 1_000;

export function extractScoreTable(source: string): Map<number, number> | null {
  let best: Map<number, number> | null = null;

  for (const start of source.matchAll(TABLE_START)) {
    const table = new Map<number, number>();
    TABLE_ENTRY.lastIndex = start.index + 1;
    let closed = false;
    let entry: RegExpExecArray | null;
    while ((entry = TABLE_ENTRY.exec(source))) {
      table.set(Number(entry[1]), Number(entry[2]));
      if (entry[3] === "}") {
        closed = true;
        break;
      }
    }
    if (closed && table.size >= MIN_TABLE_ENTRIES) {
      if (!best || table.size > best.size) {
        best = table;
      }
    }
  }

  return best;
}

export function compressScoreTable(
  table: Map<number, number>
): CompressedTable {
  const lowestScoreByPercent = new Map<number, number>();
  for (const [score, percent] of table) {
    const rounded = Math.trunc(percent * 2) / 2;
    const current = lowestScoreByPercent.get(rounded);
    if (current === undefined || score < current) {
      lowestScoreByPercent.set(rounded, score);
    }
  }

  const compressed: CompressedTable = {};
  for (const [percent, score] of lowestScoreByPercent) {
    compressed[String(score)] = percent;
  }
  return compressed;
}

const MIN_COMPRESSED_ENTRIES = 20;

export function isPlausibleTable(table: CompressedTable): boolean {
  const entries = Object.entries(table)
    .map(([score, percent]) => [Number(score), percent] as const)
    .sort((a, b) => a[0] - b[0]);
  return (
    entries.length >= MIN_COMPRESSED_ENTRIES &&
    entries.every(
      ([score, percent], index) =>
        Number.isFinite(score) &&
        percent >= 0 &&
        percent <= 100 &&
        (index === 0 || percent >= entries[index - 1]![1])
    )
  );
}

export class ScoreTable {
  private readonly scores: number[];
  private readonly percents: number[];

  constructor(readonly compressed: CompressedTable) {
    const entries = Object.entries(compressed)
      .map(([score, percent]) => [Number(score), percent] as const)
      .sort((a, b) => a[0] - b[0]);
    if (entries.length === 0) {
      throw new Error("The score table is empty");
    }
    this.scores = entries.map(([score]) => score);
    this.percents = entries.map(([, percent]) => percent);
  }

  percentOf(score: number): number {
    let low = 0;
    let high = this.scores.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.scores[mid]! <= score) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return this.percents[Math.max(low - 1, 0)]!;
  }

  tierOf(score: number): TierOrError {
    if (score < 0) {
      return "ERROR";
    }
    const percent = this.percentOf(score);
    if (percent < 0) return "ERROR";
    if (percent < 1) return "TRASH";
    if (percent < 50) return "COMMON";
    if (percent < 75) return "UNCOMMON";
    if (percent < 90) return "RARE";
    if (percent < 95) return "EPIC";
    if (percent < 99) return "ANOMALY";
    if (percent < 100) return "MYTHIC";
    return "ERROR";
  }

  equals(other: CompressedTable): boolean {
    const keys = Object.keys(this.compressed);
    return (
      keys.length === Object.keys(other).length &&
      keys.every((key) => other[key] === this.compressed[key])
    );
  }
}

export function formatPercent(percent: number): string {
  return percent > 50
    ? `${Math.floor(100 - percent)}%`
    : `${Math.ceil(percent)}%`;
}
