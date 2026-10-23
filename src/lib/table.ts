import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  drawCircularImage,
  drawHighlight,
  fillTextCentered,
  font,
  PALETTE,
  rgb,
  type Rgb,
} from "./imaging.js";
import { drawPanel, fitText, LABEL_SIZE, PANEL_PADDING } from "./stat-card.js";

const ROW_HEIGHT = 58;
const ROW_FONT = 24;
const HEADER_HEIGHT = 52;
// A table title sits in the panel, above a full-width separator; the column
// headers then start 8 px higher than at the top of a panel without title.
const TITLE_CENTER_Y = 21;
const TITLE_SEPARATOR_Y = 43;
const TITLE_HEIGHT = 38;
const BOTTOM_PADDING = 12;
const EXTRA_GAP = 14;
const SEPARATOR_HEIGHT = 2;
const MIN_NAME_SIZE = 16;

const MEDAL_SIZE = 40;
const MEDAL_X = -6;
const RANK_CENTER_X = 14;
const RANK_WIDTH = 40;
const AVATAR_SIZE = 40;
const AVATAR_X = 48;
const NAME_X = 100;

export interface TableColumn<Row> {
  header: string;
  x: number;
  align?: "left" | "right";
  // Without it, the column only labels what another column draws below it.
  draw?: (ctx: SKRSContext2D, row: Row, x: number, centerY: number) => void;
}

export interface Table<Row> {
  title?: string;
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

export function tableHeight(
  rows: number,
  extra = false,
  titled = false
): number {
  const extraHeight = extra ? EXTRA_GAP + ROW_HEIGHT : 0;
  const titleHeight = titled ? TITLE_HEIGHT : 0;
  return (
    titleHeight +
    HEADER_HEIGHT +
    rows * ROW_HEIGHT +
    extraHeight +
    BOTTOM_PADDING
  );
}

export function drawTable<Row>(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  { title, columns, rows, extra, extraAccent, highlight }: Table<Row>
): void {
  drawPanel(
    ctx,
    x,
    y,
    width,
    tableHeight(rows.length, extra !== undefined, title !== undefined)
  );
  if (title !== undefined) {
    ctx.font = font(LABEL_SIZE);
    ctx.fillStyle = rgb(PALETTE.text);
    ctx.textAlign = "left";
    fillTextCentered(ctx, title, x + PANEL_PADDING, y + TITLE_CENTER_Y);
    ctx.fillStyle = rgb(PALETTE.separator);
    ctx.fillRect(x + 1, y + TITLE_SEPARATOR_Y, width - 2, SEPARATOR_HEIGHT);
    y += TITLE_HEIGHT;
  }

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
      column.draw?.(ctx, row, x + column.x, top + ROW_HEIGHT / 2);
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

// The rank (a medal for the top 3), the avatar and the name, under two
// headers: one above the ranks, one aligned with the names.
export function playerColumn<Row extends RankedPlayer>(
  headers: { rank: string; player: string },
  nameWidth: number,
  medals: Image[]
): TableColumn<Row>[] {
  const ranks: TableColumn<Row> = {
    header: headers.rank,
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
  return [ranks, { header: headers.player, x: PANEL_PADDING + NAME_X }];
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
