import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { formatPercentage } from "#lib/format.js";
import {
  fillTextCentered,
  font,
  loadAsset,
  PALETTE,
  registerFont,
  rgb,
} from "#lib/imaging.js";
import { drawTrendArrow, TREND_COLORS } from "#lib/stat-card.js";
import { drawCellText } from "#lib/table.js";
import {
  formatPercent,
  TIER_COLORS,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import { formatCompact } from "./format.js";

const ASSETS = new URL("../assets/", import.meta.url);
const MONO_FONT = "SpaceMonoBold";

const SMALL_FONT = 20;

const ICON_SIZE = 30;
const ICON_GAP = 10;
const DELTA_WIDEST = "+00.0k";
const ARROW_GAP = 8;
const ARROW_WIDTH = 14;

const NUMBER_SIZE = 22;
const NUMBER_HEIGHT = 36;
const NUMBER_PADDING = 10;
const NUMBER_RADIUS = 7;
const NUMBER_BORDER = 2;
const NUMBER_DIGITS = "0000000";
const NUMBER_FILL_TOP = 0.3;
const NUMBER_FILL_BOTTOM = 0.1;
const NUMBER_BORDER_ALPHA = 0.75;

export interface PlacementIcons {
  up: Image;
  down: Image;
}

export function drawRollNumber(
  ctx: SKRSContext2D,
  number: number,
  tier: TierOrError,
  x: number,
  centerY: number
): void {
  registerFont(new URL("spacemono_bold.ttf", ASSETS), MONO_FONT);
  const text = String(number);
  ctx.font = font(NUMBER_SIZE, MONO_FONT);
  const width =
    Math.max(
      ctx.measureText(NUMBER_DIGITS).width,
      ctx.measureText(text).width
    ) +
    2 * NUMBER_PADDING;
  const top = centerY - NUMBER_HEIGHT / 2;
  const [r, g, b] = TIER_COLORS[tier];
  const tint = (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

  ctx.beginPath();
  ctx.roundRect(x, top, width, NUMBER_HEIGHT, NUMBER_RADIUS);
  ctx.fillStyle = rgb(PALETTE.background);
  ctx.fill();
  const gradient = ctx.createLinearGradient(0, top, 0, top + NUMBER_HEIGHT);
  gradient.addColorStop(0, tint(NUMBER_FILL_TOP));
  gradient.addColorStop(1, tint(NUMBER_FILL_BOTTOM));
  ctx.fillStyle = gradient;
  ctx.fill();

  const inset = NUMBER_BORDER / 2;
  ctx.beginPath();
  ctx.roundRect(
    x + inset,
    top + inset,
    width - NUMBER_BORDER,
    NUMBER_HEIGHT - NUMBER_BORDER,
    NUMBER_RADIUS - inset
  );
  ctx.lineWidth = NUMBER_BORDER;
  ctx.strokeStyle = tint(NUMBER_BORDER_ALPHA);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = rgb(TIER_COLORS[tier]);
  fillTextCentered(ctx, text, x + width / 2, centerY);
}

export function loadPlacementIcons(): Promise<PlacementIcons> {
  return Promise.all([
    loadAsset(new URL("arrow_up.png", ASSETS)),
    loadAsset(new URL("trash.png", ASSETS)),
  ]).then(([up, down]) => ({ up, down }));
}

export function drawPlacement(
  ctx: SKRSContext2D,
  percent: number,
  tier: TierOrError,
  right: number,
  centerY: number,
  icons: PlacementIcons,
  locale: string
): void {
  drawCellText(ctx, formatPercent(percent, locale), right, centerY, {
    align: "right",
    color: TIER_COLORS[tier],
  });
  const textWidth = ctx.measureText(formatPercentage(99, locale)).width;
  ctx.drawImage(
    percent > 50 ? icons.up : icons.down,
    right - textWidth - ICON_GAP - ICON_SIZE,
    centerY - ICON_SIZE / 2,
    ICON_SIZE,
    ICON_SIZE
  );
}

export function formatDelta(delta: number, locale: string): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return sign + formatCompact(Math.abs(delta), locale);
}

export function drawDelta(
  ctx: SKRSContext2D,
  delta: number | null,
  right: number,
  centerY: number,
  newLabel: string,
  locale: string
): void {
  if (delta === null || delta === 0) {
    drawCellText(ctx, delta === null ? newLabel : "=", right, centerY, {
      align: "right",
      color: PALETTE.placeholder,
      size: SMALL_FONT,
    });
    return;
  }
  const direction = delta > 0 ? "up" : "down";
  drawCellText(ctx, formatDelta(delta, locale), right, centerY, {
    align: "right",
    color: TREND_COLORS[direction],
    size: SMALL_FONT,
  });
  const widest = ctx.measureText(DELTA_WIDEST).width;
  drawTrendArrow(
    ctx,
    right - widest - ARROW_GAP - ARROW_WIDTH,
    centerY,
    direction
  );
}
