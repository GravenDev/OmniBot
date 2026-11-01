import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { PALETTE, rgb } from "#lib/imaging.js";
import {
  drawPanel,
  drawPanelTitle,
  measureText,
  PANEL_PADDING,
  renderStatCard,
  type StatBox,
} from "#lib/stat-card.js";
import { drawCellText } from "#lib/table.js";
import {
  CERTAIN_GROUP_SIZE,
  collisionProbability,
  HALF_GROUP_SIZE,
} from "../services/paradox.js";
import type { BirthdayStats } from "../services/stats.js";
import { ACCENT } from "./theme.js";

const WIDTH = 1100;
const CURVE_WIDTH = 460;
const CURVE_TOP = 56;
const CURVE_BOTTOM = 34;
const CURVE_RIGHT = 30;
const LABEL_SIZE = 15;
const MONTHS_HEIGHT = 220;
const MONTHS_TOP = 70;
const MONTHS_BOTTOM = 36;
const BAR_RATIO = 0.6;
const BAR_MIN = 3;
const POINT_RADIUS = 7;
const HERE_SIZE = 17;

export interface StatBoxLabels {
  title: string;
  value: string;
  subtext: string;
}

export interface StatsCardLabels {
  title: string;
  subtitle: string;
  probability: StatBoxLabels;
  shared: StatBoxLabels;
  firstCollision: StatBoxLabels;
  untilHalf: StatBoxLabels;
  curve: {
    title: string;
    /** The two thresholds, as percentages. */
    half: string;
    certain: string;
    here: string;
  };
  /** Month names, January first. */
  months: { title: string; names: string[] };
  alt: string;
}

const box = (labels: StatBoxLabels, color?: StatBox["color"]): StatBox => ({
  ...labels,
  ...(color && { color }),
});

function dashed(
  ctx: SKRSContext2D,
  from: [number, number],
  to: [number, number]
): void {
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = rgb(PALETTE.separator);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(...from);
  ctx.lineTo(...to);
  ctx.stroke();
  ctx.restore();
}

/** The probability of a shared date by group size, and where the group is. */
function drawCurve(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  stats: BirthdayStats,
  labels: StatsCardLabels["curve"]
): void {
  drawPanel(ctx, x, y, width, height);
  drawPanelTitle(ctx, labels.title, x, y);
  const left = x + PANEL_PADDING;
  const right = x + width - CURVE_RIGHT;
  const top = y + CURVE_TOP;
  const bottom = y + height - CURVE_BOTTOM;
  const px = (size: number) => left + (size / stats.curveMax) * (right - left);
  const py = (probability: number) => bottom - probability * (bottom - top);

  // The thresholds: one chance in two, then 99 %.
  for (const [size, text] of [
    [HALF_GROUP_SIZE, labels.half],
    [CERTAIN_GROUP_SIZE, labels.certain],
  ] as const) {
    const level = py(collisionProbability(size));
    dashed(ctx, [left, level], [right, level]);
    dashed(ctx, [px(size), level], [px(size), bottom]);
    // At the left, where the curve is still low.
    drawCellText(ctx, text, left + 2, level - 11, {
      color: PALETTE.subtext,
      size: LABEL_SIZE,
    });
    drawCellText(ctx, String(size), px(size), bottom + 16, {
      align: "center",
      color: PALETTE.subtext,
      size: LABEL_SIZE,
    });
  }
  ctx.strokeStyle = rgb(PALETTE.separator);
  ctx.beginPath();
  ctx.moveTo(left, bottom + 0.5);
  ctx.lineTo(right, bottom + 0.5);
  ctx.stroke();
  drawCellText(ctx, "0", left, bottom + 16, {
    color: PALETTE.subtext,
    size: LABEL_SIZE,
  });
  drawCellText(ctx, String(stats.curveMax), right, bottom + 16, {
    align: "center",
    color: PALETTE.subtext,
    size: LABEL_SIZE,
  });

  const points: [number, number][] = [];
  for (let size = 0; size <= stats.curveMax; size++) {
    points.push([px(size), py(collisionProbability(size))]);
  }
  const area = ctx.createLinearGradient(0, top, 0, bottom);
  area.addColorStop(0, `rgba(${ACCENT.join(", ")}, 0.28)`);
  area.addColorStop(1, `rgba(${ACCENT.join(", ")}, 0.02)`);
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  for (const point of points) {
    ctx.lineTo(...point);
  }
  ctx.lineTo(right, bottom);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  ctx.beginPath();
  points.forEach((point, index) =>
    index === 0 ? ctx.moveTo(...point) : ctx.lineTo(...point)
  );
  ctx.strokeStyle = rgb(ACCENT);
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineWidth = 1;

  // "You are here", clear of the line: under it once the curve rises (above
  // while it is flat at zero), on its right unless the text has no room.
  const hereX = px(stats.count);
  const hereY = py(stats.probability);
  ctx.beginPath();
  ctx.arc(hereX, hereY, POINT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = rgb(PALETTE.text);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgb(ACCENT);
  ctx.stroke();
  ctx.lineWidth = 1;
  const onLeft =
    hereX + 14 + measureText(ctx, labels.here, HERE_SIZE) > x + width - 8;
  drawCellText(
    ctx,
    labels.here,
    hereX + (onLeft ? -14 : 14),
    stats.probability < 0.1 ? hereY - 18 : Math.min(hereY + 20, bottom - 14),
    { align: onLeft ? "right" : "left", color: PALETTE.text, size: HERE_SIZE }
  );
}

/** Registrations per month: twelve bars, never a day's count. */
function drawMonths(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  months: number[],
  labels: StatsCardLabels["months"]
): void {
  drawPanel(ctx, x, y, width, MONTHS_HEIGHT);
  drawPanelTitle(ctx, labels.title, x, y);
  const max = Math.max(1, ...months);
  const left = x + PANEL_PADDING;
  const slot = (width - 2 * PANEL_PADDING) / months.length;
  const barWidth = slot * BAR_RATIO;
  const top = y + MONTHS_TOP;
  const bottom = y + MONTHS_HEIGHT - MONTHS_BOTTOM;
  months.forEach((count, month) => {
    const center = left + month * slot + slot / 2;
    const height = Math.max(BAR_MIN, ((bottom - top) * count) / max);
    ctx.fillStyle = rgb(count === 0 ? PALETTE.track : ACCENT);
    ctx.beginPath();
    ctx.roundRect(
      center - barWidth / 2,
      bottom - height,
      barWidth,
      height,
      [4, 4, 0, 0]
    );
    ctx.fill();
    if (count > 0) {
      drawCellText(ctx, String(count), center, bottom - height - 14, {
        align: "center",
        color: PALETTE.text,
        size: 17,
      });
    }
    drawCellText(ctx, labels.names[month] ?? "", center, bottom + 18, {
      align: "center",
      color: PALETTE.subtext,
      size: LABEL_SIZE,
      fitWidth: slot - 4,
    });
  });
}

/** `/birthday stats` as an image: the boxes, the curve and the months. */
export function renderStatsCard(
  stats: BirthdayStats,
  labels: StatsCardLabels,
  icon: Image | null
): Promise<Buffer> {
  return renderStatCard({
    accent: ACCENT,
    width: WIDTH,
    image: icon,
    title: labels.title,
    subtitle: labels.subtitle,
    rows: [
      [box(labels.probability, ACCENT), box(labels.shared)],
      [box(labels.firstCollision), box(labels.untilHalf)],
    ],
    aside: {
      width: CURVE_WIDTH,
      draw: (ctx, x, y, width, height) =>
        drawCurve(ctx, x, y, width, height, stats, labels.curve),
    },
    footer: {
      height: MONTHS_HEIGHT,
      draw: (ctx, x, y, width) =>
        drawMonths(ctx, x, y, width, stats.months, labels.months),
    },
  });
}
