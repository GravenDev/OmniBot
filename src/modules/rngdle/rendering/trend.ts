import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { PALETTE, rgb } from "#lib/imaging.js";
import {
  drawPanel,
  drawPanelTitle,
  drawText,
  measureText,
  PANEL_PADDING,
  renderStatCard,
  type StatBox,
} from "#lib/stat-card.js";
import { DAY_MS } from "#modules/rngdle/services/days.js";
import {
  TIER_COLORS,
  type Tier,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import { PROFILE_BREAKDOWN, tierBreakdown } from "./cards.js";
import { formatEp, formatSpaced } from "./format.js";
import { ACCENT } from "./theme.js";
import type { TimelineMonth } from "./timeline.js";

const SHORT_WINDOW = 7;
const LONG_WINDOW = 30;
const LONG_PERIOD = 90;

const CHART_HEIGHT = 300;
const CHART_TOP = 56;
const CHART_BOTTOM = 44;
const BAR_GAP = 3;
const MIN_BAR_HEIGHT = 3;
const COMMON_ALPHA = 0.55;
const DASH = 6;
const DASH_STEP = 12;
const LINE_WIDTH = 3;
const TICK_HEIGHT = 12;
const MONTH_SIZE = 16;
const MONTH_Y = 24;
const LEGEND_Y = 20;
const LEGEND_SIZE = 15;
const LEGEND_SWATCH = 22;
const LEGEND_GAP = 8;
const LEGEND_SPACING = 28;

export interface TrendRoll {
  rolledAt: Date;
  percent: number;
  tier: TierOrError;
}

export interface TrendBestRoll {
  number: number;
  score: number;
  tier: TierOrError;
  dateText: string;
}

export interface TrendImageData {
  username: string;
  avatar: Image | null;
  from: Date;
  days: number;
  months: TimelineMonth[];
  rolls: TrendRoll[];
  best: TrendBestRoll;
  worst: TrendBestRoll;
  averageScore: number;
  averageTier: TierOrError;
  averagePercent: number;
  upperHalf: number;
  change: number | null;
  tierCounts: Record<Tier, number>;
}

export interface TrendLabels {
  subtitle: string;
  bestRoll: string;
  worstRoll: string;
  roll: (number: string) => string;
  averageScore: string;
  averageOver: (count: number) => string;
  change: (percent: number) => string;
  previous: string;
  placement: string;
  placementValue: (percent: number) => string;
  upperHalf: (count: number, total: number) => string;
  tierBreakdown: string;
  expected: string;
  expectedCount: (value: number) => string;
  chart: string;
  midline: string;
  movingAverage: string;
}

export function movingWindow(days: number): number {
  return days > LONG_PERIOD ? LONG_WINDOW : SHORT_WINDOW;
}

export function movingAverage(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function drawChart(
  ctx: SKRSContext2D,
  data: TrendImageData,
  labels: TrendLabels,
  x: number,
  y: number,
  width: number
): void {
  drawPanel(ctx, x, y, width, CHART_HEIGHT);
  drawPanelTitle(ctx, labels.chart, x, y);

  const left = x + PANEL_PADDING;
  const right = x + width - PANEL_PADDING;
  const top = y + CHART_TOP;
  const bottom = y + CHART_HEIGHT - CHART_BOTTOM;
  const span = bottom - top;
  const step = (right - left) / data.days;
  const gap = step > BAR_GAP * 2 ? BAR_GAP : 0;
  const dayOf = (date: Date) =>
    Math.floor((date.getTime() - data.from.getTime()) / DAY_MS);
  const yOf = (percent: number) => bottom - (percent / 100) * span;

  const mid = yOf(50);
  ctx.fillStyle = rgb(PALETTE.track);
  for (let dash = left; dash < right; dash += DASH_STEP) {
    ctx.fillRect(dash, mid, DASH, 1);
  }

  for (const roll of data.rolls) {
    const height = Math.max(MIN_BAR_HEIGHT, (roll.percent / 100) * span);
    ctx.beginPath();
    ctx.roundRect(
      left + dayOf(roll.rolledAt) * step + gap / 2,
      bottom - height,
      Math.max(1, step - gap),
      height,
      Math.min(2, step / 2)
    );
    ctx.globalAlpha = roll.tier === "COMMON" ? COMMON_ALPHA : 1;
    ctx.fillStyle = rgb(TIER_COLORS[roll.tier]);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const averages = movingAverage(
    data.rolls.map((roll) => roll.percent),
    movingWindow(data.days)
  );
  ctx.beginPath();
  data.rolls.forEach((roll, index) => {
    const pointX = left + (dayOf(roll.rolledAt) + 0.5) * step;
    const pointY = yOf(averages[index]!);
    if (index === 0) {
      ctx.moveTo(pointX, pointY);
    } else {
      ctx.lineTo(pointX, pointY);
    }
  });
  ctx.strokeStyle = rgb(PALETTE.text);
  ctx.lineWidth = LINE_WIDTH;
  ctx.stroke();

  ctx.fillStyle = rgb(PALETTE.separator);
  ctx.fillRect(left, bottom, right - left, 2);
  for (const month of data.months) {
    const tickX = left + dayOf(month.start) * step;
    ctx.fillStyle = rgb(PALETTE.separator);
    ctx.fillRect(tickX - 1, bottom + 10 - TICK_HEIGHT / 2, 2, TICK_HEIGHT);
    drawText(
      ctx,
      month.label,
      tickX - measureText(ctx, month.label, MONTH_SIZE) / 2,
      bottom + MONTH_Y,
      MONTH_SIZE,
      PALETTE.subtext
    );
  }

  const averageX = right - measureText(ctx, labels.movingAverage, LEGEND_SIZE);
  drawText(
    ctx,
    labels.movingAverage,
    averageX,
    y + LEGEND_Y,
    LEGEND_SIZE,
    PALETTE.subtext
  );
  ctx.fillStyle = rgb(PALETTE.text);
  ctx.fillRect(
    averageX - LEGEND_SWATCH - LEGEND_GAP,
    y + LEGEND_Y + 8,
    LEGEND_SWATCH,
    LINE_WIDTH
  );

  const midlineX =
    averageX -
    LEGEND_SWATCH -
    LEGEND_SPACING -
    measureText(ctx, labels.midline, LEGEND_SIZE);
  drawText(
    ctx,
    labels.midline,
    midlineX,
    y + LEGEND_Y,
    LEGEND_SIZE,
    PALETTE.subtext
  );
  ctx.fillStyle = rgb(PALETTE.subtext);
  for (let dash = 0; dash < LEGEND_SWATCH; dash += DASH_STEP / 2) {
    ctx.fillRect(
      midlineX - LEGEND_SWATCH - LEGEND_GAP + dash,
      y + LEGEND_Y + 9,
      DASH / 2,
      1
    );
  }
}

export function renderTrend(
  data: TrendImageData,
  labels: TrendLabels
): Promise<Buffer> {
  const rollBox = (title: string, roll: TrendBestRoll): StatBox => ({
    title,
    value: formatEp(roll.score),
    color: TIER_COLORS[roll.tier],
    highlight: true,
    subtext: `${labels.roll(formatSpaced(roll.number))} · ${roll.dateText}`,
  });
  const total = data.rolls.length;

  return renderStatCard({
    accent: ACCENT,
    image: data.avatar,
    title: data.username,
    subtitle: labels.subtitle,
    rows: [
      [
        rollBox(labels.bestRoll, data.best),
        rollBox(labels.worstRoll, data.worst),
      ],
      [
        {
          title: labels.averageScore,
          value: formatEp(data.averageScore),
          color: TIER_COLORS[data.averageTier],
          subtext:
            data.change === null ? labels.averageOver(total) : labels.previous,
          trend:
            data.change === null
              ? undefined
              : {
                  text: labels.change(data.change),
                  direction: data.change >= 0 ? "up" : "down",
                },
        },
        {
          title: labels.placement,
          value: labels.placementValue(data.averagePercent),
          color: ACCENT,
          subtext: labels.upperHalf(data.upperHalf, total),
        },
      ],
    ],
    aside: tierBreakdown(
      labels.tierBreakdown,
      labels.expected,
      labels.expectedCount,
      data.tierCounts,
      PROFILE_BREAKDOWN
    ),
    footer: {
      height: CHART_HEIGHT,
      draw: (ctx, x, y, width) => drawChart(ctx, data, labels, x, y, width),
    },
  });
}
