import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  drawCircularImage,
  drawHighlight,
  fillTextCentered,
  font,
  loadAsset,
  PALETTE,
  registerFont,
  rgb,
  type Rgb,
} from "#lib/imaging.js";
import {
  drawPanel,
  drawTrendArrow,
  fitText,
  LABEL_SIZE,
  PANEL_PADDING,
  TREND_COLORS,
} from "#lib/stat-card.js";
import {
  formatPercent,
  TIER_COLORS,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import { formatCompact } from "./format.js";

const ASSETS = new URL("../assets/", import.meta.url);
const MONO_FONT = "SpaceMonoBold";

export const ROW_HEIGHT = 58;
export const ROW_FONT = 24;
const HEADER_HEIGHT = 52;
const BOTTOM_PADDING = 12;
const EXTRA_GAP = 14;
const SEPARATOR_HEIGHT = 2;
const SMALL_FONT = 20;
const MIN_NAME_SIZE = 16;

const MEDAL_SIZE = 40;
const MEDAL_X = -6;
const RANK_CENTER_X = 14;
const RANK_WIDTH = 40;
const AVATAR_SIZE = 40;
const AVATAR_X = 48;
const NAME_X = 100;

const ICON_SIZE = 30;
const ICON_GAP = 10;
const PLACEMENT_WIDEST = "99%";
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

export interface TableColumn<Row> {
  header: string;
  x: number;
  align?: "left" | "right";
  draw: (ctx: SKRSContext2D, row: Row, x: number, centerY: number) => void;
}

export interface Table<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  extra?: Row | undefined;
  extraAccent?: Rgb;
  highlight?: (row: Row, index: number) => Rgb | undefined;
}

export interface RankedPlayer {
  rank: number;
  name: string;
  avatar: Image | null;
}

export interface PlacementIcons {
  up: Image;
  down: Image;
}

export function tableHeight(rows: number, extra = false): number {
  const extraHeight = extra ? EXTRA_GAP + ROW_HEIGHT : 0;
  return HEADER_HEIGHT + rows * ROW_HEIGHT + extraHeight + BOTTOM_PADDING;
}

export function drawTable<Row>(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  { columns, rows, extra, extraAccent, highlight }: Table<Row>
): void {
  drawPanel(ctx, x, y, width, tableHeight(rows.length, extra !== undefined));

  const headerY = y + HEADER_HEIGHT / 2 + 2;
  ctx.font = font(LABEL_SIZE);
  ctx.fillStyle = rgb(PALETTE.title);
  for (const column of columns) {
    ctx.textAlign = column.align ?? "left";
    fillTextCentered(ctx, column.header, x + column.x, headerY);
  }

  const drawRow = (row: Row, top: number, tint?: Rgb, band = false) => {
    if (band) {
      ctx.fillStyle = rgb(PALETTE.rowOdd);
      ctx.fillRect(x + 1, top, width - 2, ROW_HEIGHT);
    }
    if (tint) {
      drawHighlight(ctx, x + 1, top, width - 2, ROW_HEIGHT, tint);
    }
    for (const column of columns) {
      column.draw(ctx, row, x + column.x, top + ROW_HEIGHT / 2);
    }
  };

  rows.forEach((row, index) => {
    drawRow(
      row,
      y + HEADER_HEIGHT + index * ROW_HEIGHT,
      highlight?.(row, index),
      index % 2 === 0
    );
  });
  if (extra !== undefined) {
    const bottom = y + HEADER_HEIGHT + rows.length * ROW_HEIGHT;
    ctx.fillStyle = rgb(PALETTE.separator);
    ctx.fillRect(
      x + 1,
      bottom + (EXTRA_GAP - SEPARATOR_HEIGHT) / 2,
      width - 2,
      SEPARATOR_HEIGHT
    );
    drawRow(extra, bottom + EXTRA_GAP, extraAccent);
  }
}

export function playerColumn<Row extends RankedPlayer>(
  header: string,
  nameWidth: number,
  medals: Image[]
): TableColumn<Row> {
  return {
    header,
    x: PANEL_PADDING,
    draw(ctx, row, x, centerY) {
      const medal = medals[row.rank - 1];
      if (medal) {
        ctx.drawImage(
          medal,
          x + MEDAL_X,
          centerY - MEDAL_SIZE / 2,
          MEDAL_SIZE,
          MEDAL_SIZE
        );
      } else {
        drawCellText(ctx, String(row.rank), x + RANK_CENTER_X, centerY, {
          align: "center",
          fitWidth: RANK_WIDTH,
        });
      }
      drawCircularImage(
        ctx,
        row.avatar,
        x + AVATAR_X,
        centerY - AVATAR_SIZE / 2,
        AVATAR_SIZE
      );
      drawCellText(ctx, row.name, x + NAME_X, centerY, {
        fitWidth: nameWidth,
      });
    },
  };
}

export function drawCellText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  centerY: number,
  {
    align = "left",
    color = PALETTE.text,
    size = ROW_FONT,
    fitWidth,
  }: {
    align?: "left" | "right" | "center";
    color?: Rgb;
    size?: number;
    fitWidth?: number;
  } = {}
): void {
  const fitted =
    fitWidth === undefined
      ? { text, size }
      : fitText(ctx, text, size, fitWidth, MIN_NAME_SIZE);
  ctx.font = font(fitted.size);
  ctx.textAlign = align;
  ctx.fillStyle = rgb(color);
  fillTextCentered(ctx, fitted.text, x, centerY);
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
  icons: PlacementIcons
): void {
  drawCellText(ctx, formatPercent(percent), right, centerY, {
    align: "right",
    color: TIER_COLORS[tier],
  });
  const textWidth = ctx.measureText(PLACEMENT_WIDEST).width;
  ctx.drawImage(
    percent > 50 ? icons.up : icons.down,
    right - textWidth - ICON_GAP - ICON_SIZE,
    centerY - ICON_SIZE / 2,
    ICON_SIZE,
    ICON_SIZE
  );
}

export function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return sign + formatCompact(Math.abs(delta));
}

export function drawDelta(
  ctx: SKRSContext2D,
  delta: number | null,
  right: number,
  centerY: number,
  newLabel: string
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
  drawCellText(ctx, formatDelta(delta), right, centerY, {
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
