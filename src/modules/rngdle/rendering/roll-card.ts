import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { formatInteger } from "#lib/format.js";
import {
  createBoard,
  drawHighlight,
  drawPortrait,
  FONT,
  fillTextCentered,
  font,
  PALETTE,
  registerFont,
  rgb,
  type Rgb,
} from "#lib/imaging.js";
import { fitText } from "#lib/stat-card.js";
import {
  TIER_COLORS,
  type Tier,
  type TierOrError,
} from "#modules/rngdle/services/scoring.js";
import {} from "./format.js";
import { ACCENT } from "./theme.js";

const ASSETS = new URL("../assets/", import.meta.url);
const MONO_FONT = "SpaceMonoBold";

const WIDTH = 1000;
const MARGIN = 40;
const HEADER_HEIGHT = 130;
const PORTRAIT_SIZE = 90;
const HERO_TOP = 160;
const HERO_HEIGHT = 240;
const SECTION_GAP = 25;
const BADGES_HEADER = 60;
const CELL_HEIGHT = 58;
const CELL_GAP = 8;
const COLUMN_GAP = 16;
const MORE_HEIGHT = 34;
const PILL_HEIGHT = 50;
const PILL_GAP = 12;
const BOTTOM_MARGIN = 30;
const MAX_BADGES = 24;
const DIMMED_ALPHA = 0.45;

export interface CardBadge {
  emoji: string;
  label: string;
  tier: Tier | null;
  ep: number | null;
  probability: number | null;
}

export interface CardHighlight {
  icon: string;
  text: string;
  color: Rgb;
}

export interface RollCardData {
  name: string;
  avatar: Image | null;
  subtitle: string;
  number: number;
  score: number;
  tier: TierOrError;
  placement: string;
  badges: CardBadge[];
  badgeCount: number;
  highlights: CardHighlight[];
}

export interface RollCardLabels {
  // The locale of the numbers drawn on the card.
  locale: string;
  number: string;
  score: string;
  badges: string;
  badgeCount: string;
  included: string;
  more: (count: number) => string;
  probability: (percent: number) => string;
}

function setFont(
  ctx: SKRSContext2D,
  size: number,
  base: string = FONT,
  spacing = 0
): void {
  ctx.font = font(size, base);
  ctx.letterSpacing = `${spacing}px`;
}

function drawLine(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  centerY: number,
  size: number,
  color: Rgb | string,
  {
    base = FONT,
    align = "left",
    spacing = 0,
  }: {
    base?: string;
    align?: "left" | "center" | "right";
    spacing?: number;
  } = {}
): number {
  setFont(ctx, size, base, spacing);
  ctx.fillStyle = typeof color === "string" ? color : rgb(color);
  ctx.textAlign = align;
  fillTextCentered(ctx, text, x, centerY);
  const width = ctx.measureText(text).width;
  ctx.textAlign = "left";
  ctx.letterSpacing = "0px";
  return width;
}

function drawGrouped(
  ctx: SKRSContext2D,
  value: number,
  x: number,
  centerY: number,
  size: number,
  color: Rgb,
  align: "left" | "right",
  locale: string
): void {
  // The French groups are spaced apart; an English number keeps its commas
  // and is drawn as one group.
  const groups = formatInteger(value, locale).split(" ");
  setFont(ctx, size, MONO_FONT);
  const gap = size * 0.22;
  const widths = groups.map((group) => ctx.measureText(group).width);
  const total =
    widths.reduce((sum, width) => sum + width, 0) + gap * (groups.length - 1);
  let cursor = align === "right" ? x - total : x;
  groups.forEach((group, index) => {
    drawLine(ctx, group, cursor, centerY, size, color, { base: MONO_FONT });
    cursor += widths[index]! + gap;
  });
}

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | ReturnType<SKRSContext2D["createLinearGradient"]>,
  stroke?: string
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function alpha([r, g, b]: Rgb, value: number): string {
  return `rgba(${r}, ${g}, ${b}, ${value})`;
}

function badgeRows(count: number): number {
  return Math.ceil(Math.min(count, MAX_BADGES) / 2);
}

function badgesHeight(data: RollCardData): number {
  if (data.badges.length === 0) {
    return data.badgeCount > 0 ? BADGES_HEADER : 0;
  }
  const hidden = data.badgeCount > Math.min(data.badges.length, MAX_BADGES);
  return (
    BADGES_HEADER +
    badgeRows(data.badges.length) * (CELL_HEIGHT + CELL_GAP) +
    (hidden ? MORE_HEIGHT : 0) +
    4
  );
}

function drawHeader(ctx: SKRSContext2D, data: RollCardData, color: Rgb) {
  const top = (HEADER_HEIGHT - PORTRAIT_SIZE) / 2;
  drawPortrait(ctx, data.avatar, MARGIN, top, PORTRAIT_SIZE, color);
  const textX = MARGIN + PORTRAIT_SIZE + 25;
  const maxWidth = WIDTH - textX - MARGIN - 80;
  const name = fitText(ctx, data.name, 44, maxWidth, 28);
  drawLine(ctx, name.text, textX, 48, name.size, PALETTE.text);
  drawLine(ctx, data.subtitle, textX, 92, 22, PALETTE.subtext);
  drawLine(ctx, "🎲", WIDTH - MARGIN, HEADER_HEIGHT / 2, 56, PALETTE.text, {
    align: "right",
  });
}

function drawHero(
  ctx: SKRSContext2D,
  data: RollCardData,
  labels: RollCardLabels,
  color: Rgb
) {
  const width = WIDTH - 2 * MARGIN;
  roundRect(ctx, MARGIN, HERO_TOP, width, HERO_HEIGHT, 12, rgb(PALETTE.box));
  const gradient = ctx.createLinearGradient(
    MARGIN,
    HERO_TOP,
    MARGIN + width,
    HERO_TOP + HERO_HEIGHT
  );
  gradient.addColorStop(0, alpha(color, 0.22));
  gradient.addColorStop(1, alpha(color, 0.04));
  roundRect(
    ctx,
    MARGIN,
    HERO_TOP,
    width,
    HERO_HEIGHT,
    12,
    gradient,
    alpha(color, 0.55)
  );

  const left = MARGIN + 30;
  const right = MARGIN + width - 30;
  drawLine(
    ctx,
    labels.number.toLocaleUpperCase(),
    left,
    HERO_TOP + 38,
    19,
    PALETTE.title
  );
  drawGrouped(
    ctx,
    data.number,
    left - 4,
    HERO_TOP + 108,
    96,
    PALETTE.text,
    "left",
    labels.locale
  );

  const pillY = HERO_TOP + 196;
  setFont(ctx, 23, FONT, 3);
  const pillWidth = Math.max(230, ctx.measureText(data.tier).width + 60);
  roundRect(ctx, left, pillY - 22, pillWidth, 44, 22, rgb(color));
  drawLine(
    ctx,
    data.tier,
    left + pillWidth / 2 + 1.5,
    pillY,
    23,
    PALETTE.background,
    {
      align: "center",
      spacing: 3,
    }
  );
  drawLine(ctx, data.placement, left + pillWidth + 18, pillY, 26, color);

  drawLine(
    ctx,
    labels.score.toLocaleUpperCase(),
    right,
    HERO_TOP + 38,
    19,
    PALETTE.title,
    {
      align: "right",
    }
  );
  drawGrouped(
    ctx,
    data.score,
    right,
    HERO_TOP + 108,
    64,
    ACCENT,
    "right",
    labels.locale
  );
  drawLine(ctx, "EP", right, pillY, 28, PALETTE.subtext, {
    base: MONO_FONT,
    align: "right",
  });
}

function drawBadge(
  ctx: SKRSContext2D,
  badge: CardBadge,
  x: number,
  y: number,
  width: number,
  labels: RollCardLabels
) {
  const color = badge.tier ? TIER_COLORS[badge.tier] : PALETTE.subtext;
  ctx.globalAlpha = badge.ep === 0 ? DIMMED_ALPHA : 1;
  drawHighlight(ctx, x, y, width, CELL_HEIGHT, color, { radius: 10 });
  const emojiX = x + 22;
  const emojiWidth = drawLine(
    ctx,
    badge.emoji,
    emojiX,
    y + CELL_HEIGHT / 2,
    24,
    PALETTE.text
  );

  const right = x + width - 16;
  const valueWidth = 110;
  // Some badges have several emojis: the label then starts after the last one.
  const textX = Math.max(x + 64, emojiX + emojiWidth + 18);
  const hasDetails = badge.tier !== null || badge.probability !== null;
  const label = fitText(ctx, badge.label, 21, right - valueWidth - textX, 15);
  drawLine(
    ctx,
    label.text,
    textX,
    hasDetails ? y + 21 : y + CELL_HEIGHT / 2,
    label.size,
    PALETTE.text
  );
  if (hasDetails) {
    const details = [
      badge.tier,
      badge.probability === null ? null : labels.probability(badge.probability),
    ]
      .filter((part) => part !== null)
      .join("  ·  ");
    drawLine(ctx, details, textX, y + 41, 13, color, { spacing: 1.2 });
  }

  if (badge.ep === 0) {
    drawLine(
      ctx,
      labels.included,
      right,
      y + CELL_HEIGHT / 2,
      16,
      PALETTE.subtext,
      {
        align: "right",
      }
    );
  } else if (badge.ep !== null) {
    drawGrouped(
      ctx,
      badge.ep,
      right,
      y + CELL_HEIGHT / 2,
      20,
      color,
      "right",
      labels.locale
    );
  }
  ctx.globalAlpha = 1;
}

function drawBadges(
  ctx: SKRSContext2D,
  data: RollCardData,
  labels: RollCardLabels,
  top: number
) {
  const width = WIDTH - 2 * MARGIN;
  roundRect(
    ctx,
    MARGIN,
    top,
    width,
    badgesHeight(data),
    12,
    rgb(PALETTE.box),
    rgb(PALETTE.border)
  );
  drawLine(
    ctx,
    labels.badges.toLocaleUpperCase(),
    MARGIN + 20,
    top + 32,
    19,
    PALETTE.title
  );
  drawLine(
    ctx,
    labels.badgeCount,
    MARGIN + width - 20,
    top + 32,
    19,
    PALETTE.subtext,
    {
      align: "right",
    }
  );

  const shown = data.badges.slice(0, MAX_BADGES);
  const rows = badgeRows(shown.length);
  const columnWidth = (width - 40 - COLUMN_GAP) / 2;
  shown.forEach((badge, index) => {
    const column = index < rows ? 0 : 1;
    const row = column === 0 ? index : index - rows;
    drawBadge(
      ctx,
      badge,
      MARGIN + 20 + column * (columnWidth + COLUMN_GAP),
      top + BADGES_HEADER + row * (CELL_HEIGHT + CELL_GAP),
      columnWidth,
      labels
    );
  });

  const hidden = data.badgeCount - shown.length;
  if (hidden > 0 && shown.length > 0) {
    drawLine(
      ctx,
      labels.more(hidden),
      MARGIN + 48,
      top + BADGES_HEADER + rows * (CELL_HEIGHT + CELL_GAP) + 14,
      21,
      PALETTE.subtext
    );
  }
}

function fittingHighlights(
  ctx: SKRSContext2D,
  highlights: CardHighlight[]
): { highlight: CardHighlight; width: number }[] {
  const fitting = [];
  let used = 0;
  for (const highlight of highlights) {
    setFont(ctx, 22);
    const width = ctx.measureText(highlight.text).width + 76;
    if (used + width > WIDTH - 2 * MARGIN) {
      break;
    }
    fitting.push({ highlight, width });
    used += width + PILL_GAP;
  }
  return fitting;
}

function drawHighlights(
  ctx: SKRSContext2D,
  highlights: { highlight: CardHighlight; width: number }[],
  top: number
) {
  let x = MARGIN;
  for (const { highlight, width } of highlights) {
    roundRect(
      ctx,
      x,
      top,
      width,
      PILL_HEIGHT,
      PILL_HEIGHT / 2,
      rgb(PALETTE.box),
      rgb(PALETTE.border)
    );
    drawLine(
      ctx,
      highlight.icon,
      x + 18,
      top + PILL_HEIGHT / 2,
      22,
      PALETTE.text
    );
    drawLine(
      ctx,
      highlight.text,
      x + 54,
      top + PILL_HEIGHT / 2,
      22,
      highlight.color
    );
    x += width + PILL_GAP;
  }
}

export function renderRollCard(
  data: RollCardData,
  labels: RollCardLabels
): Promise<Buffer> {
  registerFont(new URL("spacemono_bold.ttf", ASSETS), MONO_FONT);
  const color = TIER_COLORS[data.tier];
  const measure = createBoard(1, 1, 0).canvas.getContext("2d");
  const highlights = fittingHighlights(measure, data.highlights);

  const badgesTop = HERO_TOP + HERO_HEIGHT + SECTION_GAP;
  const badges = badgesHeight(data);
  const highlightsTop =
    badgesTop + (badges > 0 ? badges + SECTION_GAP - 5 : -5);
  const height =
    highlights.length > 0
      ? highlightsTop + PILL_HEIGHT + BOTTOM_MARGIN
      : highlightsTop - SECTION_GAP + 5 + BOTTOM_MARGIN;

  const ctx = createBoard(WIDTH, height, HEADER_HEIGHT, color);
  drawHeader(ctx, data, color);
  drawHero(ctx, data, labels, color);
  if (badges > 0) {
    drawBadges(ctx, data, labels, badgesTop);
  }
  drawHighlights(ctx, highlights, highlightsTop);
  return ctx.canvas.encode("png");
}
