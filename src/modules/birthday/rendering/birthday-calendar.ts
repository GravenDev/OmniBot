import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  createBoard,
  drawableText,
  drawHighlight,
  drawPortraitStack,
  fillTextAnchored,
  font,
  PALETTE,
  rgb,
} from "#lib/imaging.js";
import {
  drawFittedText,
  drawText,
  fillPanel,
  fitText,
  PANEL_RADIUS,
  strokePanel,
} from "#lib/stat-card.js";
import { ACCENT } from "./theme.js";

const WIDTH = 1000;
const MARGIN = 40;
const HEADER_HEIGHT = 140;
const WEEKDAYS_TOP = HEADER_HEIGHT + 22;
const GRID_TOP = HEADER_HEIGHT + 60;
const GAP = 8;
const CELL_WIDTH = (WIDTH - 2 * MARGIN - 6 * GAP) / 7;
const CELL_HEIGHT = 118;
const AVATAR_SIZE = 44;
const AVATAR_STEP = 28;

/** Avatars drawn in a day's cell; more members than three: two, then "+N". */
export function shownAvatars(count: number): number {
  return count <= 3 ? count : 2;
}

export interface Celebrant {
  name: string;
  avatar: Image | null;
}

export interface BirthdayCalendar {
  /** Empty cells before the 1st, in the first week. */
  leading: number;
  /** Members celebrating on each day of the month, the 1st first. */
  days: Celebrant[][];
}

export interface BirthdayCalendarLabels {
  kicker: string;
  title: string;
  /** Short weekday names, in column order. */
  weekdays: string[];
  /** Under the avatars of a day with several members, instead of names. */
  several: (count: number) => string;
}

function drawCentered(
  ctx: SKRSContext2D,
  value: string,
  centerX: number,
  y: number,
  size: number,
  maxWidth: number
): void {
  const fitted = fitText(ctx, value, size, maxWidth, size - 3);
  ctx.font = font(fitted.size);
  ctx.textAlign = "center";
  fillTextAnchored(ctx, fitted.text, centerX, y, "ascender");
  ctx.textAlign = "left";
}

/** `several`: what stands for the names when the day has several members. */
function drawDay(
  ctx: SKRSContext2D,
  day: number,
  members: Celebrant[],
  several: string,
  x: number,
  y: number
): void {
  fillPanel(ctx, x, y, CELL_WIDTH, CELL_HEIGHT);
  if (members.length > 0) {
    drawHighlight(ctx, x, y, CELL_WIDTH, CELL_HEIGHT, ACCENT, {
      radius: PANEL_RADIUS,
    });
  }
  strokePanel(ctx, x, y, CELL_WIDTH, CELL_HEIGHT);
  drawText(
    ctx,
    String(day),
    x + 12,
    y + 8,
    18,
    members.length > 0 ? ACCENT : PALETTE.placeholder
  );
  if (members.length === 0) {
    return;
  }
  const centerX = x + CELL_WIDTH / 2 + 2;
  drawPortraitStack(
    ctx,
    members.map((member) => member.avatar),
    {
      shown: shownAvatars(members.length),
      centerX,
      centerY: y + 36 + AVATAR_SIZE / 2,
      size: AVATAR_SIZE,
      step: AVATAR_STEP,
      ring: ACCENT,
      countSize: 18,
    }
  );
  ctx.fillStyle = rgb(PALETTE.title);
  drawCentered(
    ctx,
    members.length === 1 ? drawableText(members[0]!.name) : several,
    centerX,
    y + 92,
    15,
    CELL_WIDTH - 16
  );
}

/** The month's grid, with the avatars of the members celebrating each day. */
export function renderBirthdayCalendar(
  { leading, days }: BirthdayCalendar,
  labels: BirthdayCalendarLabels
): Buffer {
  const weeks = Math.ceil((leading + days.length) / 7);
  const height = GRID_TOP + weeks * (CELL_HEIGHT + GAP) - GAP + MARGIN;
  const ctx = createBoard(WIDTH, height, HEADER_HEIGHT, ACCENT);

  drawText(ctx, labels.kicker.toUpperCase(), MARGIN, 30, 22, ACCENT);
  drawFittedText(
    ctx,
    `🎂  ${labels.title}`,
    MARGIN,
    62,
    48,
    PALETTE.text,
    WIDTH - 2 * MARGIN,
    28
  );

  labels.weekdays.forEach((weekday, column) => {
    ctx.fillStyle = rgb(PALETTE.subtext);
    drawCentered(
      ctx,
      weekday,
      MARGIN + column * (CELL_WIDTH + GAP) + CELL_WIDTH / 2,
      WEEKDAYS_TOP,
      18,
      CELL_WIDTH
    );
  });

  days.forEach((members, index) => {
    const cell = leading + index;
    drawDay(
      ctx,
      index + 1,
      members,
      labels.several(members.length),
      MARGIN + (cell % 7) * (CELL_WIDTH + GAP),
      GRID_TOP + Math.floor(cell / 7) * (CELL_HEIGHT + GAP)
    );
  });
  return ctx.canvas.toBuffer("image/png");
}
