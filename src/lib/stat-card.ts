import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  createBoard,
  drawCircularImage,
  fillTextAnchored,
  font,
  loadMedals,
  PALETTE,
  rgb,
  type Rgb,
} from "./imaging.js";

const WIDTH = 800;
const HEADER_HEIGHT = 150;
export const CARD_MARGIN = 40;
export const CARD_CONTENT_WIDTH = WIDTH - 2 * CARD_MARGIN;
const PORTRAIT_Y = 25;
const PORTRAIT_SIZE = 100;
const TITLE_X = 170;

const ROWS_TOP = 180;
const ROW_STEP = 130;
const BOX_HEIGHT = 110;
const BOTTOM_MARGIN = 30;
const PANEL_RADIUS = 12;
export const PANEL_PADDING = 20;
const BOX_TITLE_Y = 15;
const BOX_VALUE_Y = 45;
const BOX_SUBTEXT_Y = 80;
const BOX_AVATAR_SIZE = 32;
const BOX_AVATAR_INSET = { x: 15, y: 10 };
export const LABEL_SIZE = 22;
const SUBTEXT_SIZE = 18;
const SUFFIX_COLOR: Rgb = [215, 215, 215];
const ROW_LAYOUTS: Record<number, { width: number; xs: number[] }> = {
  1: { width: CARD_CONTENT_WIDTH, xs: [CARD_MARGIN] },
  2: { width: 345, xs: [40, 415] },
  3: { width: 226, xs: [40, 286, 532] },
};

const RANK_RIGHT = 760;
const RANK_SIZE = 80;
const RANK_Y = 25;
const RANK_COLOR: Rgb = [150, 150, 150];
const TOTAL_SIZE = 30;
const TOTAL_Y = 70;
const MEDAL_Y = 15;
const MEDAL_HEIGHT = 90;
const MEDAL_WIDTHS = [90, 93, 93];

export interface StatBox {
  title: string;
  value: string;
  color?: Rgb;
  suffix?: string;
  subtext?: string;
  avatar?: Image | null;
}

export interface CardSection {
  height: number;
  draw: (ctx: SKRSContext2D, top: number) => void;
}

export interface StatCard {
  image: Image | null;
  title: { text: string; y: number; size: number };
  rank?: { position: number; total: number };
  valueSize: number;
  rows: StatBox[][];
  footer?: CardSection;
}

export function drawText(
  ctx: SKRSContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: Rgb
): void {
  ctx.font = font(size);
  ctx.fillStyle = rgb(color);
  fillTextAnchored(ctx, value, x, y, "ascender");
}

export function measureText(
  ctx: SKRSContext2D,
  value: string,
  size: number
): number {
  ctx.font = font(size);
  return ctx.measureText(value).width;
}

export function drawPanel(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  outline?: Rgb
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width + 1, height + 1, PANEL_RADIUS);
  ctx.fillStyle = rgb(PALETTE.box);
  ctx.fill();
  if (outline) {
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, width - 1, height - 1, PANEL_RADIUS - 1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgb(outline);
    ctx.stroke();
  }
}

export function drawPanelTitle(
  ctx: SKRSContext2D,
  title: string,
  x: number,
  y: number
): void {
  drawText(
    ctx,
    title,
    x + PANEL_PADDING,
    y + BOX_TITLE_Y,
    LABEL_SIZE,
    PALETTE.title
  );
}

function drawStatBox(
  ctx: SKRSContext2D,
  valueSize: number,
  x: number,
  y: number,
  width: number,
  { title, value, color, suffix, subtext, avatar }: StatBox
): void {
  const left = x + PANEL_PADDING;
  drawPanel(ctx, x, y, width, BOX_HEIGHT, color);
  drawPanelTitle(ctx, title, x, y);
  if (avatar !== undefined) {
    const avatarX = x + width - BOX_AVATAR_SIZE - BOX_AVATAR_INSET.x;
    const avatarY = y + BOX_AVATAR_INSET.y;
    drawCircularImage(ctx, avatar, avatarX, avatarY, BOX_AVATAR_SIZE);
  }
  const valueY = y + BOX_VALUE_Y;
  drawText(ctx, value, left, valueY, valueSize, color ?? PALETTE.text);
  if (suffix) {
    const suffixX = left + measureText(ctx, `${value} `, valueSize);
    drawText(ctx, suffix, suffixX, valueY, valueSize, SUFFIX_COLOR);
  }
  if (subtext) {
    drawText(
      ctx,
      subtext,
      left,
      y + BOX_SUBTEXT_Y,
      SUBTEXT_SIZE,
      PALETTE.subtext
    );
  }
}

function drawRank(
  ctx: SKRSContext2D,
  { position, total }: { position: number; total: number },
  medals: Image[]
): void {
  const totalText = ` / ${total}`;
  const right = RANK_RIGHT - measureText(ctx, totalText, TOTAL_SIZE);
  const medal = medals[position - 1];
  const width = MEDAL_WIDTHS[position - 1];
  if (medal && width) {
    ctx.drawImage(
      medal,
      Math.trunc(right - width),
      MEDAL_Y,
      width,
      MEDAL_HEIGHT
    );
  } else {
    const rankText = `#${position}`;
    const rankX = right - measureText(ctx, rankText, RANK_SIZE);
    drawText(ctx, rankText, rankX, RANK_Y, RANK_SIZE, RANK_COLOR);
  }
  drawText(ctx, totalText, right, TOTAL_Y, TOTAL_SIZE, PALETTE.subtext);
}

export async function renderStatCard(card: StatCard): Promise<Buffer> {
  const medals = card.rank ? await loadMedals() : [];
  const footerTop = ROWS_TOP + card.rows.length * ROW_STEP;
  const height =
    footerTop + (card.footer?.height ?? BOX_HEIGHT - ROW_STEP) + BOTTOM_MARGIN;
  const ctx = createBoard(WIDTH, height, HEADER_HEIGHT);
  ctx.textAlign = "left";

  drawCircularImage(ctx, card.image, CARD_MARGIN, PORTRAIT_Y, PORTRAIT_SIZE);
  const { text, y, size } = card.title;
  drawText(ctx, text, TITLE_X, y, size, PALETTE.text);
  if (card.rank && card.rank.position > 0) {
    drawRank(ctx, card.rank, medals);
  }

  card.rows.forEach((boxes, row) => {
    const layout = ROW_LAYOUTS[boxes.length];
    if (!layout) {
      throw new Error(
        `A stat card row holds 1 to 3 boxes, got ${boxes.length}`
      );
    }
    boxes.forEach((box, index) => {
      drawStatBox(
        ctx,
        card.valueSize,
        layout.xs[index]!,
        ROWS_TOP + row * ROW_STEP,
        layout.width,
        box
      );
    });
  });
  card.footer?.draw(ctx, footerTop);

  return ctx.canvas.encode("png");
}
