import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { PALETTE, rgb, type Rgb } from "#lib/imaging.js";
import {
  drawPanel,
  drawPanelTitle,
  drawText,
  measureText,
  PANEL_PADDING,
  renderStatCard,
  type StatBox,
} from "#lib/stat-card.js";
import { TIER_COLORS, TIER_ODDS } from "#modules/rngdle/services/scoring.js";
import { formatSpaced } from "./format.js";
import { ACCENT } from "./theme.js";

export const TIMELINE_TIERS = ["MYTHIC", "ANOMALY", "TRASH"] as const;

export type TimelineTier = (typeof TIMELINE_TIERS)[number];

const TIMELINE_HEIGHT = 400;
const LINE_INSET = 10;
const LINE_Y = 270;
const LINE_WIDTH = 4;
const TICK_HEIGHT = 16;
const MONTH_SIZE = 16;
const MONTH_Y = 80;
const MONTH_GAP = 12;
const NOW_RADIUS = 7;
const PIN_GAP = 6;
const PIN_SIZES: Record<TimelineTier, number> = {
  MYTHIC: 13,
  ANOMALY: 10,
  TRASH: 10,
};
const LANE_HEIGHT = 34;
const LANE_SPACING = 24;
const MAX_LANES = 3;
const LABEL_TOP = 56;
const LABEL_ROW = 46;
const LABEL_SPACING = 120;
const SCORE_SIZE = 17;
const DATE_SIZE = 14;
const DATE_OFFSET = 22;
const STEM_TOP = 40;
const STEM_ALPHA = 0.35;
const LEGEND_Y = 20;
const LEGEND_SIZE = 15;
const LEGEND_DOT = 6;
const LEGEND_GAP = 34;

export interface TimelinePin {
  at: Date;
  tier: TimelineTier;
  score: number;
  dateText: string;
}

export interface TimelineMonth {
  start: Date;
  label: string;
}

export interface TimelineImageData {
  username: string;
  avatar: Image | null;
  from: Date;
  to: Date;
  firstRoll: Date;
  now: Date;
  months: TimelineMonth[];
  pins: TimelinePin[];
  totalRolls: number;
}

export interface TimelineLabels {
  subtitle: string;
  counts: Record<TimelineTier, string>;
  legend: Record<TimelineTier, string>;
  expected: (value: number) => string;
  timeline: string;
}

function drawPin(
  ctx: SKRSContext2D,
  x: number,
  tipY: number,
  color: Rgb,
  size: number,
  down: boolean
): void {
  ctx.save();
  ctx.translate(x, tipY);
  if (down) {
    ctx.scale(1, -1);
  }
  const headY = -size * 1.9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size * 0.86, headY + size * 0.5);
  ctx.arc(0, headY, size, Math.PI - 0.53, 0.53, false);
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgb(PALETTE.box);
  ctx.stroke();
  ctx.fillStyle = rgb(color);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, headY, size * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = rgb(PALETTE.box);
  ctx.fill();
  ctx.restore();
}

function drawCentered(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: Rgb,
  bounds: [number, number]
): void {
  const width = measureText(ctx, text, size);
  const left = Math.min(Math.max(x - width / 2, bounds[0]), bounds[1] - width);
  drawText(ctx, text, left, y, size, color);
}

function drawMonths(
  ctx: SKRSContext2D,
  months: TimelineMonth[],
  xOf: (date: Date) => number,
  end: Date,
  lineY: number
): void {
  let freeFrom = -Infinity;
  months.forEach((month, index) => {
    const x = xOf(month.start);
    ctx.fillStyle = rgb(PALETTE.separator);
    ctx.fillRect(x - 1, lineY - TICK_HEIGHT / 2, 2, TICK_HEIGHT);
    const next = months[index + 1]?.start ?? end;
    const center = (x + xOf(next)) / 2;
    const width = measureText(ctx, month.label, MONTH_SIZE);
    if (center - width / 2 < freeFrom) {
      return;
    }
    freeFrom = center + width / 2 + MONTH_GAP;
    drawText(
      ctx,
      month.label,
      center - width / 2,
      lineY + MONTH_Y,
      MONTH_SIZE,
      PALETTE.subtext
    );
  });
  const x = xOf(end);
  ctx.fillStyle = rgb(PALETTE.separator);
  ctx.fillRect(x - 1, lineY - TICK_HEIGHT / 2, 2, TICK_HEIGHT);
}

function drawLegend(
  ctx: SKRSContext2D,
  legend: Record<TimelineTier, string>,
  right: number,
  y: number
): void {
  let x = right;
  for (const tier of [...TIMELINE_TIERS].reverse()) {
    x -= measureText(ctx, legend[tier], LEGEND_SIZE);
    drawText(ctx, legend[tier], x, y, LEGEND_SIZE, PALETTE.subtext);
    ctx.beginPath();
    ctx.arc(x - 12, y + LEGEND_SIZE * 0.6, LEGEND_DOT, 0, Math.PI * 2);
    ctx.fillStyle = rgb(TIER_COLORS[tier]);
    ctx.fill();
    x -= LEGEND_GAP;
  }
}

export function stackPins(
  pins: TimelinePin[],
  xOf: (date: Date) => number
): { pin: TimelinePin; x: number; lane: number }[] {
  const lanes = { up: [] as number[][], down: [] as number[][] };
  const mythicsFirst = [...pins].sort(
    (a, b) => Number(b.tier === "MYTHIC") - Number(a.tier === "MYTHIC")
  );
  return mythicsFirst.map((pin) => {
    const x = xOf(pin.at);
    const stack = pin.tier === "TRASH" ? lanes.down : lanes.up;
    let lane = 0;
    while (
      lane < MAX_LANES - 1 &&
      stack[lane]?.some((other) => Math.abs(other - x) < LANE_SPACING)
    ) {
      lane++;
    }
    (stack[lane] ??= []).push(x);
    return { pin, x, lane };
  });
}

export function renderTimeline(
  data: TimelineImageData,
  labels: TimelineLabels
): Promise<Buffer> {
  const count = (tier: TimelineTier) =>
    data.pins.filter((pin) => pin.tier === tier).length;
  const countBox = (tier: TimelineTier): StatBox => ({
    title: labels.counts[tier],
    value: formatSpaced(count(tier)),
    subtext: labels.expected(data.totalRolls * TIER_ODDS[tier]),
    ...(count(tier) > 0 && { color: TIER_COLORS[tier], highlight: true }),
  });

  return renderStatCard({
    accent: ACCENT,
    image: data.avatar,
    title: data.username,
    subtitle: labels.subtitle,
    rows: [TIMELINE_TIERS.map(countBox)],
    footer: {
      height: TIMELINE_HEIGHT,
      draw(ctx, x, y, width) {
        drawPanel(ctx, x, y, width, TIMELINE_HEIGHT);
        drawPanelTitle(ctx, labels.timeline, x, y);
        drawLegend(ctx, labels.legend, x + width - PANEL_PADDING, y + LEGEND_Y);

        const left = x + PANEL_PADDING + LINE_INSET;
        const right = x + width - PANEL_PADDING - LINE_INSET;
        const bounds: [number, number] = [x + PANEL_PADDING, right];
        const lineY = y + LINE_Y;
        const span = data.to.getTime() - data.from.getTime();
        const xOf = (date: Date) =>
          left +
          ((date.getTime() - data.from.getTime()) / span) * (right - left);

        ctx.fillStyle = rgb(PALETTE.separator);
        ctx.fillRect(left, lineY - LINE_WIDTH / 2, right - left, LINE_WIDTH);
        ctx.fillStyle = rgb(ACCENT);
        ctx.fillRect(
          xOf(data.firstRoll),
          lineY - LINE_WIDTH / 2,
          xOf(data.now) - xOf(data.firstRoll),
          LINE_WIDTH
        );
        drawMonths(ctx, data.months, xOf, data.to, lineY);
        ctx.beginPath();
        ctx.arc(xOf(data.now), lineY, NOW_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = rgb(ACCENT);
        ctx.fill();

        const labelled: number[] = [];
        for (const { pin, x: pinX, lane } of stackPins(data.pins, xOf)) {
          const down = pin.tier === "TRASH";
          const size = PIN_SIZES[pin.tier];
          const offset = PIN_GAP + lane * LANE_HEIGHT;
          const tip = down ? lineY + offset : lineY - offset;
          drawPin(ctx, pinX, tip, TIER_COLORS[pin.tier], size, down);
          if (pin.tier !== "MYTHIC") {
            continue;
          }

          const row =
            labelled.filter((other) => Math.abs(other - pinX) < LABEL_SPACING)
              .length % 2;
          labelled.push(pinX);
          const top = y + LABEL_TOP + row * LABEL_ROW;
          ctx.globalAlpha = STEM_ALPHA;
          ctx.fillStyle = rgb(TIER_COLORS.MYTHIC);
          ctx.fillRect(
            pinX - 0.5,
            top + STEM_TOP,
            1,
            Math.max(0, tip - size * 3.4 - top - STEM_TOP)
          );
          ctx.globalAlpha = 1;
          drawCentered(
            ctx,
            `${formatSpaced(pin.score)} EP`,
            pinX,
            top,
            SCORE_SIZE,
            TIER_COLORS.MYTHIC,
            bounds
          );
          drawCentered(
            ctx,
            pin.dateText,
            pinX,
            top + DATE_OFFSET,
            DATE_SIZE,
            PALETTE.subtext,
            bounds
          );
        }
      },
    },
  });
}
