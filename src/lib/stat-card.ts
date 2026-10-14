import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  createBoard,
  DEFAULT_ACCENT,
  drawCircularImage,
  drawHighlight,
  drawPortrait,
  fillTextAnchored,
  fillTextCentered,
  font,
  loadMedals,
  PALETTE,
  rgb,
  type Rgb,
} from "./imaging.js";

const DEFAULT_WIDTH = 1000;
const MARGIN = 40;
export const HEADER_HEIGHT = 130;
const HEADER_CENTER = HEADER_HEIGHT / 2;
export const PORTRAIT_SIZE = 90;
const TITLE_X = MARGIN + PORTRAIT_SIZE + 24;
export const TITLE_SIZE = 44;
export const TITLE_MIN_SIZE = 30;
const SUBTITLE_SIZE = 20;
const RANK_GAP = 24;

export const BODY_TOP = HEADER_HEIGHT + 30;
export const BOTTOM_MARGIN = 30;
export const GAP = 20;
const BOX_HEIGHT = 110;
const PANEL_RADIUS = 12;
export const PANEL_PADDING = 20;
export const LABEL_SIZE = 19;
export const VALUE_SIZE = 32;
export const SUBTEXT_SIZE = 17;
export const SUBTEXT_MIN_SIZE = 13;
const BOX_TITLE_Y = 16;
const BOX_VALUE_Y = 42;
const BOX_SUBTEXT_Y = 84;
const BOX_AVATAR_SIZE = 30;
const BOX_AVATAR_INSET = 14;

const RANK_SIZE = 64;
const TOTAL_SIZE = 26;
const MEDAL_HEIGHT = 76;
const MEDAL_WIDTHS = [76, 78, 78];

export interface StatBox {
  title: string;
  value: string;
  color?: Rgb;
  highlight?: boolean;
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
  accent?: Rgb;
  width?: number;
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
  maxWidth: number,
  minSize?: number
): void {
  const fitted = fitText(ctx, value, size, maxWidth, minSize);
  drawText(
    ctx,
    fitted.text,
    x,
    y + (size - fitted.size) * 0.5,
    fitted.size,
    color
  );
}

export function fitText(
  ctx: SKRSContext2D,
  value: string,
  size: number,
  maxWidth: number,
  minSize = 10
): { text: string; size: number } {
  let fitted = size;
  while (fitted > minSize && measureText(ctx, value, fitted) > maxWidth) {
    fitted -= 1;
  }
  const chars = [...value];
  let text = value;
  while (chars.length > 1 && measureText(ctx, text, fitted) > maxWidth) {
    chars.pop();
    text = `${chars.join("").trimEnd()}…`;
  }
  return { text, size: fitted };
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
  highlight?: Rgb,
  edge?: "left" | "right"
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, PANEL_RADIUS);
  ctx.fillStyle = rgb(PALETTE.box);
  ctx.fill();
  if (highlight) {
    drawHighlight(ctx, x, y, width, height, highlight, {
      radius: PANEL_RADIUS,
      ...(edge && { edge }),
    });
  }
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, width - 1, height - 1, PANEL_RADIUS);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgb(PALETTE.border);
  ctx.stroke();
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
  { title, value, color, highlight = true, subtext, avatar }: StatBox
): void {
  const left = x + PANEL_PADDING;
  drawPanel(ctx, x, y, width, BOX_HEIGHT, highlight ? color : undefined);
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
      innerWidth,
      SUBTEXT_MIN_SIZE
    );
  }
}

function rankWidth(
  ctx: SKRSContext2D,
  { position, total }: { position: number; total: number },
  medals: Image[]
): number {
  const medalWidth = MEDAL_WIDTHS[position - 1];
  if (medals[position - 1] && medalWidth) {
    return medalWidth;
  }
  return (
    measureText(ctx, `#${position}`, RANK_SIZE) +
    measureText(ctx, ` / ${total}`, TOTAL_SIZE)
  );
}

function drawRank(
  ctx: SKRSContext2D,
  { position, total }: { position: number; total: number },
  medals: Image[],
  accent: Rgb,
  right: number
): void {
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
  ctx.fillStyle = rgb(accent);
  fillTextCentered(ctx, `#${position}`, rankRight, HEADER_CENTER);
  ctx.textAlign = "left";
}

export async function renderStatCard(card: StatCard): Promise<Buffer> {
  const medals = card.rank ? await loadMedals() : [];
  const accent = card.accent ?? DEFAULT_ACCENT;
  const width = card.width ?? DEFAULT_WIDTH;
  const bodyHeight =
    card.rows.length * BOX_HEIGHT + (card.rows.length - 1) * GAP;
  const ctx = createBoard(
    width,
    BODY_TOP + bodyHeight + BOTTOM_MARGIN,
    HEADER_HEIGHT,
    accent
  );
  ctx.textAlign = "left";

  const portraitY = HEADER_CENTER - PORTRAIT_SIZE / 2;
  drawPortrait(ctx, card.image, MARGIN, portraitY, PORTRAIT_SIZE, accent);
  const rank = card.rank && card.rank.position > 0 ? card.rank : undefined;
  const titleWidth =
    width -
    MARGIN -
    TITLE_X -
    (rank ? rankWidth(ctx, rank, medals) + RANK_GAP : 0);
  const title = fitText(
    ctx,
    card.title,
    TITLE_SIZE,
    titleWidth,
    TITLE_MIN_SIZE
  );
  ctx.font = font(title.size);
  ctx.fillStyle = rgb(PALETTE.text);
  const titleY = card.subtitle ? HEADER_CENTER - 12 : HEADER_CENTER;
  fillTextCentered(ctx, title.text, TITLE_X, titleY);
  if (card.subtitle) {
    const subtitle = fitText(
      ctx,
      card.subtitle,
      SUBTITLE_SIZE,
      titleWidth,
      SUBTITLE_SIZE
    );
    ctx.font = font(subtitle.size);
    ctx.fillStyle = rgb(PALETTE.subtext);
    fillTextCentered(ctx, subtitle.text, TITLE_X, HEADER_CENTER + 26);
  }
  if (rank) {
    drawRank(ctx, rank, medals, accent, width - MARGIN);
  }

  const contentWidth = width - 2 * MARGIN;
  const asideWidth = card.aside ? card.aside.width + GAP : 0;
  const boxesWidth = contentWidth - asideWidth;
  card.rows.forEach((boxes, row) => {
    if (boxes.length === 0 || boxes.length > 3) {
      throw new Error(
        `A stat card row holds 1 to 3 boxes, got ${boxes.length}`
      );
    }
    const boxWidth = (boxesWidth - GAP * (boxes.length - 1)) / boxes.length;
    boxes.forEach((box, index) => {
      drawStatBox(
        ctx,
        MARGIN + index * (boxWidth + GAP),
        BODY_TOP + row * (BOX_HEIGHT + GAP),
        boxWidth,
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
