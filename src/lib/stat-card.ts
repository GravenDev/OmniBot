import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  createBoard,
  drawCircularImage,
  fillTextAnchored,
  fillTextCentered,
  font,
  loadMedals,
  PALETTE,
  rgb,
  type Rgb,
} from "./imaging.js";

const WIDTH = 1000;
const MARGIN = 40;
const HEADER_HEIGHT = 130;
const HEADER_CENTER = HEADER_HEIGHT / 2;
const PORTRAIT_SIZE = 90;
const TITLE_X = MARGIN + PORTRAIT_SIZE + 24;
const TITLE_SIZE = 44;
const SUBTITLE_SIZE = 20;

const BODY_TOP = HEADER_HEIGHT + 30;
const BOTTOM_MARGIN = 30;
const GAP = 20;
const BOX_HEIGHT = 110;
const PANEL_RADIUS = 12;
export const PANEL_PADDING = 20;
export const LABEL_SIZE = 19;
const VALUE_SIZE = 32;
const SUBTEXT_SIZE = 17;
const BOX_TITLE_Y = 16;
const BOX_VALUE_Y = 42;
const BOX_SUBTEXT_Y = 84;
const BOX_AVATAR_SIZE = 30;
const BOX_AVATAR_INSET = 14;

const RANK_SIZE = 64;
const TOTAL_SIZE = 26;
const RANK_COLOR: Rgb = [150, 150, 150];
const MEDAL_HEIGHT = 76;
const MEDAL_WIDTHS = [76, 78, 78];

export interface StatBox {
  title: string;
  value: string;
  color?: Rgb;
  outline?: boolean;
  subtext?: string;
  avatar?: Image | null;
}

export interface CardAside {
  width: number;
  draw: (
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
}

export interface StatCard {
  image: Image | null;
  title: string;
  subtitle?: string;
  rank?: { position: number; total: number };
  rows: StatBox[][];
  aside?: CardAside;
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

export function drawFittedText(
  ctx: SKRSContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: Rgb,
  maxWidth: number
): void {
  let fitted = size;
  while (fitted > 10 && measureText(ctx, value, fitted) > maxWidth) {
    fitted -= 1;
  }
  drawText(ctx, value, x, y + (size - fitted) * 0.5, fitted, color);
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
  ctx.roundRect(x, y, width, height, PANEL_RADIUS);
  ctx.fillStyle = rgb(PALETTE.box);
  ctx.fill();
  if (outline) {
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, width - 2, height - 2, PANEL_RADIUS - 1);
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
  x: number,
  y: number,
  width: number,
  { title, value, color, outline = true, subtext, avatar }: StatBox
): void {
  const left = x + PANEL_PADDING;
  drawPanel(ctx, x, y, width, BOX_HEIGHT, outline ? color : undefined);
  drawPanelTitle(ctx, title, x, y);
  if (avatar !== undefined) {
    const avatarX = x + width - BOX_AVATAR_SIZE - BOX_AVATAR_INSET;
    drawCircularImage(
      ctx,
      avatar,
      avatarX,
      y + BOX_AVATAR_INSET,
      BOX_AVATAR_SIZE
    );
  }
  const innerWidth = width - 2 * PANEL_PADDING;
  drawFittedText(
    ctx,
    value,
    left,
    y + BOX_VALUE_Y,
    VALUE_SIZE,
    color ?? PALETTE.text,
    innerWidth
  );
  if (subtext) {
    drawFittedText(
      ctx,
      subtext,
      left,
      y + BOX_SUBTEXT_Y,
      SUBTEXT_SIZE,
      PALETTE.subtext,
      innerWidth
    );
  }
}

function drawRank(
  ctx: SKRSContext2D,
  { position, total }: { position: number; total: number },
  medals: Image[]
): void {
  const right = WIDTH - MARGIN;
  const medal = medals[position - 1];
  const medalWidth = MEDAL_WIDTHS[position - 1];
  if (medal && medalWidth) {
    ctx.drawImage(
      medal,
      right - medalWidth,
      HEADER_CENTER - MEDAL_HEIGHT / 2,
      medalWidth,
      MEDAL_HEIGHT
    );
    return;
  }

  const totalText = ` / ${total}`;
  ctx.textAlign = "right";
  ctx.font = font(TOTAL_SIZE);
  ctx.fillStyle = rgb(PALETTE.subtext);
  fillTextCentered(ctx, totalText, right, HEADER_CENTER + 14);
  const rankRight = right - measureText(ctx, totalText, TOTAL_SIZE);
  ctx.font = font(RANK_SIZE);
  ctx.fillStyle = rgb(RANK_COLOR);
  fillTextCentered(ctx, `#${position}`, rankRight, HEADER_CENTER);
  ctx.textAlign = "left";
}

export async function renderStatCard(card: StatCard): Promise<Buffer> {
  const medals = card.rank ? await loadMedals() : [];
  const bodyHeight =
    card.rows.length * BOX_HEIGHT + (card.rows.length - 1) * GAP;
  const ctx = createBoard(
    WIDTH,
    BODY_TOP + bodyHeight + BOTTOM_MARGIN,
    HEADER_HEIGHT
  );
  ctx.textAlign = "left";

  const portraitY = HEADER_CENTER - PORTRAIT_SIZE / 2;
  drawCircularImage(ctx, card.image, MARGIN, portraitY, PORTRAIT_SIZE);
  ctx.font = font(TITLE_SIZE);
  ctx.fillStyle = rgb(PALETTE.text);
  const titleY = card.subtitle ? HEADER_CENTER - 12 : HEADER_CENTER;
  fillTextCentered(ctx, card.title, TITLE_X, titleY);
  if (card.subtitle) {
    ctx.font = font(SUBTITLE_SIZE);
    ctx.fillStyle = rgb(PALETTE.subtext);
    fillTextCentered(ctx, card.subtitle, TITLE_X, HEADER_CENTER + 26);
  }
  if (card.rank && card.rank.position > 0) {
    drawRank(ctx, card.rank, medals);
  }

  const contentWidth = WIDTH - 2 * MARGIN;
  const asideWidth = card.aside ? card.aside.width + GAP : 0;
  const boxesWidth = contentWidth - asideWidth;
  card.rows.forEach((boxes, row) => {
    if (boxes.length === 0 || boxes.length > 3) {
      throw new Error(
        `A stat card row holds 1 to 3 boxes, got ${boxes.length}`
      );
    }
    const width = (boxesWidth - GAP * (boxes.length - 1)) / boxes.length;
    boxes.forEach((box, index) => {
      drawStatBox(
        ctx,
        MARGIN + index * (width + GAP),
        BODY_TOP + row * (BOX_HEIGHT + GAP),
        width,
        box
      );
    });
  });
  if (card.aside) {
    card.aside.draw(
      ctx,
      MARGIN + boxesWidth + GAP,
      BODY_TOP,
      card.aside.width,
      bodyHeight
    );
  }

  return ctx.canvas.encode("png");
}
