import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  createBoard,
  drawCircularImage,
  fillBand,
  fillTextCentered,
  font,
  FONT,
  loadMedals,
  PALETTE,
  rgb,
  type Rgb,
} from "./imaging.js";

const DEFAULT_WIDTH = 800;
const HEADER_HEIGHT = 100;
const ROW_HEIGHT = 90;
const FONT_SIZE = 30;
const RANK_X = 15;
const RANK_TEXT_X = 30;
const MEDAL_SIZE = 50;
const AVATAR_X = 100;
const AVATAR_SIZE = 60;
const PLAYER_X = 190;
const PLAYER_MAX_WIDTH = 320;
const ICON_SIZE = 40;
const ICON_GAP = 10;
const CALLER_GAP = 20;
const SEPARATOR_HEIGHT = 2;
const SEPARATOR_COLOR: Rgb = [80, 80, 80];

export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar: Image | null;
}

export interface Cell {
  text: string;
  color?: Rgb;
  family?: string;
  icon?: Image;
}

export interface Column<Row> {
  header: string;
  x: number;
  maxWidth: number;
  align?: "left" | "right";
  cell: (row: Row) => Cell;
}

export interface LeaderboardTable<Row> {
  headers: { rank: string; player: string };
  columns: Column<Row>[];
  rows: Row[];
  caller?: Row | undefined;
  width?: number;
}

function fitFont(
  ctx: SKRSContext2D,
  text: string,
  family: string,
  maxWidth: number
): number {
  for (let size = FONT_SIZE; ; size--) {
    ctx.font = font(size, family);
    const { width } = ctx.measureText(text);
    if (size <= 1 || width <= maxWidth) {
      return width;
    }
  }
}

function drawCell(
  ctx: SKRSContext2D,
  { text, color = PALETTE.text, family = FONT, icon }: Cell,
  x: number,
  centerY: number,
  maxWidth: number,
  align: "left" | "right" = "left"
): void {
  const width = fitFont(ctx, text, family, maxWidth);
  if (icon) {
    ctx.drawImage(
      icon,
      Math.trunc(x - width - ICON_GAP - ICON_SIZE),
      centerY - ICON_SIZE / 2,
      ICON_SIZE,
      ICON_SIZE
    );
  }
  ctx.fillStyle = rgb(color);
  ctx.textAlign = align;
  fillTextCentered(ctx, text, x, centerY);
}

export async function renderLeaderboardTable<Row extends LeaderboardEntry>({
  headers,
  columns,
  rows,
  caller,
  width = DEFAULT_WIDTH,
}: LeaderboardTable<Row>): Promise<Buffer> {
  const bottom = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
  const callerTop = bottom + CALLER_GAP;
  const height = caller ? callerTop + ROW_HEIGHT : bottom;
  const ctx = createBoard(width, height, HEADER_HEIGHT);
  const medals = await loadMedals();

  const headerY = HEADER_HEIGHT / 2;
  ctx.font = font(FONT_SIZE);
  ctx.fillStyle = rgb(PALETTE.text);
  ctx.textAlign = "left";
  fillTextCentered(ctx, headers.rank, RANK_X, headerY);
  fillTextCentered(ctx, headers.player, PLAYER_X, headerY);
  for (const { header, x, align = "left" } of columns) {
    ctx.textAlign = align;
    fillTextCentered(ctx, header, x, headerY);
  }

  const drawRow = (row: Row, top: number, color: Rgb): void => {
    fillBand(ctx, color, top, top + ROW_HEIGHT);
    const y = top + ROW_HEIGHT / 2;
    const medal = medals[row.rank - 1];
    if (medal) {
      ctx.drawImage(medal, RANK_X, y - MEDAL_SIZE / 2, MEDAL_SIZE, MEDAL_SIZE);
    } else {
      ctx.font = font(FONT_SIZE);
      ctx.fillStyle = rgb(PALETTE.text);
      ctx.textAlign = "left";
      fillTextCentered(ctx, String(row.rank), RANK_TEXT_X, y);
    }
    const avatarY = top + (ROW_HEIGHT - AVATAR_SIZE) / 2;
    drawCircularImage(ctx, row.avatar, AVATAR_X, avatarY, AVATAR_SIZE);
    drawCell(ctx, { text: row.name }, PLAYER_X, y, PLAYER_MAX_WIDTH);
    for (const { x, maxWidth, align, cell } of columns) {
      drawCell(ctx, cell(row), x, y, maxWidth, align);
    }
  };

  rows.forEach((row, index) => {
    const color = index % 2 === 0 ? PALETTE.rowEven : PALETTE.rowOdd;
    drawRow(row, HEADER_HEIGHT + index * ROW_HEIGHT, color);
  });
  if (caller) {
    const separatorTop = bottom + CALLER_GAP / 2;
    const separatorBottom = separatorTop + SEPARATOR_HEIGHT - 1;
    fillBand(ctx, SEPARATOR_COLOR, separatorTop, separatorBottom);
    drawRow(caller, callerTop, PALETTE.rowEven);
  }

  return ctx.canvas.encode("png");
}
