import type { Image } from "@napi-rs/canvas";
import { PALETTE } from "#lib/imaging.js";
import { PANEL_PADDING, renderStatCard } from "#lib/stat-card.js";
import {
  TIER_COLORS,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import { formatCompact, formatEp } from "./format.js";
import {
  drawCellText,
  drawPlacement,
  drawRollNumber,
  drawTable,
  loadPlacementIcons,
  tableHeight,
} from "./table.js";
import { ACCENT } from "./theme.js";

export interface HistoryRow {
  dateText: string;
  today: boolean;
  number: number;
  score: number;
  percent: number;
  tier: TierOrError;
}

export interface HistoryImageData {
  username: string;
  avatar: Image | null;
  rows: HistoryRow[];
  averageScore: number;
  averageTier: TierOrError;
  averagePercent: number;
  upperHalf: number;
  currentStreak: number;
  bestStreak: number;
}

export interface HistoryLabels {
  // The locale of the numbers drawn on the card.
  locale: string;
  subtitle: (count: number) => string;
  averageScore: string;
  averageTier: (tier: TierOrError) => string;
  placement: string;
  placementValue: (percent: number) => string;
  upperHalf: (count: number, total: number) => string;
  streak: string;
  streakValue: (count: number) => string;
  streakRecord: (count: number) => string;
  date: string;
  number: string;
  score: string;
  placementHeader: string;
}

function bestIndex(rows: HistoryRow[]): number {
  return rows.reduce(
    (best, row, index) => (row.score > rows[best]!.score ? index : best),
    0
  );
}

export async function renderHistory(
  data: HistoryImageData,
  labels: HistoryLabels
): Promise<Buffer> {
  const icons = await loadPlacementIcons();
  const best = bestIndex(data.rows);

  return renderStatCard({
    accent: ACCENT,
    image: data.avatar,
    title: data.username,
    subtitle: labels.subtitle(data.rows.length),
    rows: [
      [
        {
          title: labels.averageScore,
          value: formatEp(data.averageScore, labels.locale),
          color: TIER_COLORS[data.averageTier],
          subtext: labels.averageTier(data.averageTier),
        },
        {
          title: labels.placement,
          value: labels.placementValue(data.averagePercent),
          color: ACCENT,
          highlight: false,
          subtext: labels.upperHalf(data.upperHalf, data.rows.length),
        },
        {
          title: labels.streak,
          value: labels.streakValue(data.currentStreak),
          subtext: labels.streakRecord(data.bestStreak),
        },
      ],
    ],
    footer: {
      height: tableHeight(data.rows.length),
      draw(ctx, x, y, width) {
        drawTable<HistoryRow>(ctx, x, y, width, {
          rows: data.rows,
          highlight: (row, index) =>
            index === best && data.rows.length > 1
              ? TIER_COLORS[row.tier]
              : undefined,
          columns: [
            {
              header: labels.date,
              x: PANEL_PADDING,
              draw: (c, row, cx, cy) =>
                drawCellText(c, row.dateText, cx, cy, {
                  color: row.today ? PALETTE.text : PALETTE.title,
                }),
            },
            {
              header: labels.number,
              x: 320,
              draw: (c, row, cx, cy) =>
                drawRollNumber(c, row.number, row.tier, cx, cy),
            },
            {
              header: labels.score,
              x: 690,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawCellText(c, formatCompact(row.score), cx, cy, {
                  align: "right",
                }),
            },
            {
              header: labels.placementHeader,
              x: width - PANEL_PADDING,
              align: "right",
              draw: (c, row, cx, cy) =>
                drawPlacement(c, row.percent, row.tier, cx, cy, icons),
            },
          ],
        });
      },
    },
  });
}
