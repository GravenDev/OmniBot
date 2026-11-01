import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  createBoard,
  drawableText,
  drawPortrait,
  fillTextCentered,
  font,
  PALETTE,
  rgb,
  type Rgb,
} from "#lib/imaging.js";
import {
  drawFittedText,
  drawText,
  fitText,
  measureText,
} from "#lib/stat-card.js";
import { ACCENT } from "./theme.js";

const WIDTH = 1000;
const HEIGHT = 380;
const PORTRAITS_CENTER = { x: 200, y: 190 };
const TEXT_LEFT = 400;
const TEXT_RIGHT = WIDTH - 50;
export const SHOWN_AVATARS = 3;
const MESSAGE_SIZE = 24;
const MESSAGE_LINE = 32;
const MESSAGE_LINES = 2;

const CONFETTI: Rgb[] = [
  ACCENT,
  [141, 196, 255],
  [255, 200, 87],
  [94, 233, 181],
  [190, 160, 255],
];

export interface Celebrant {
  name: string;
  avatar: Image | null;
}

export interface BirthdayCardLabels {
  kicker: string;
  title: string;
  date: string;
  /** The guild's own message, drawn in quotes under the names. */
  message?: { text: string; open: string; close: string };
}

/** Confetti drawn from a fixed seed: the same card always looks the same. */
function drawConfetti(ctx: SKRSContext2D): void {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 70; i++) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    const color = CONFETTI[Math.floor(random() * CONFETTI.length)]!;
    const angle = random() * Math.PI;
    const size = 6 + random() * 8;
    const round = random() < 0.35;
    const alpha = 0.55 + random() * 0.35;
    // Clear of the text.
    if (x > TEXT_LEFT - 20 && x < TEXT_RIGHT + 10 && y > 60 && y < 330) {
      continue;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgb(color);
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (round) {
      ctx.beginPath();
      ctx.arc(0, 0, size / 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-size / 2, -size / 5, size, size / 2.5);
    }
    ctx.restore();
  }
}

/** Up to three overlapping portraits, then a "+N" bubble for the others. */
function drawPortraits(ctx: SKRSContext2D, celebrants: Celebrant[]): void {
  const shown = celebrants.slice(0, SHOWN_AVATARS);
  const others = celebrants.length - shown.length;
  const count = shown.length + (others > 0 ? 1 : 0);
  const size = count === 1 ? 190 : count <= 3 ? 130 : 110;
  const step = size * 0.62;
  const left = PORTRAITS_CENTER.x - (size + step * (count - 1)) / 2;
  const top = PORTRAITS_CENTER.y - size / 2;
  shown.forEach((celebrant, index) =>
    drawPortrait(ctx, celebrant.avatar, left + index * step, top, size, ACCENT)
  );
  if (others > 0) {
    const x = left + shown.length * step;
    // Darker than a missing avatar, so that it does not read as a member.
    drawPortrait(ctx, null, x, top, size, ACCENT);
    ctx.beginPath();
    ctx.arc(x + size / 2, PORTRAITS_CENTER.y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = rgb(PALETTE.header);
    ctx.fill();
    ctx.font = font(40);
    ctx.fillStyle = rgb(ACCENT);
    ctx.textAlign = "center";
    fillTextCentered(ctx, `+${others}`, x + size / 2, PORTRAITS_CENTER.y);
    ctx.textAlign = "left";
  }
}

/** The message on at most `MESSAGE_LINES` lines, the last one cut with "…". */
function messageLines(
  ctx: SKRSContext2D,
  { text, open, close }: NonNullable<BirthdayCardLabels["message"]>
): string[] {
  // Room for the quotes on every line keeps the closing one after a "…".
  const width =
    TEXT_RIGHT - TEXT_LEFT - measureText(ctx, open + close, MESSAGE_SIZE);
  const lines: string[] = [];
  let words = drawableText(text).trim().split(/\s+/);
  while (words.length > 0 && lines.length < MESSAGE_LINES - 1) {
    let count = 1;
    while (
      count < words.length &&
      measureText(ctx, words.slice(0, count + 1).join(" "), MESSAGE_SIZE) <=
        width
    ) {
      count++;
    }
    lines.push(words.slice(0, count).join(" "));
    words = words.slice(count);
  }
  if (words.length > 0) {
    lines.push(words.join(" "));
  }
  const fitted = lines.map(
    (line) => fitText(ctx, line, MESSAGE_SIZE, width, MESSAGE_SIZE).text
  );
  fitted[0] = open + fitted[0];
  fitted[fitted.length - 1] += close;
  return fitted;
}

/** The day's birthday card: who celebrates, and the guild's message if any. */
export function renderBirthdayCard(
  celebrants: Celebrant[],
  labels: BirthdayCardLabels
): Buffer {
  const ctx = createBoard(WIDTH, HEIGHT, 0, ACCENT);

  const { x, y } = PORTRAITS_CENTER;
  const glow = ctx.createRadialGradient(x, y, 20, x, y, 260);
  glow.addColorStop(0, `rgba(${ACCENT.join(", ")}, 0.28)`);
  glow.addColorStop(1, `rgba(${ACCENT.join(", ")}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawConfetti(ctx);
  drawPortraits(ctx, celebrants);

  const width = TEXT_RIGHT - TEXT_LEFT;
  const others = celebrants.length - SHOWN_AVATARS;
  const names = celebrants
    .slice(0, SHOWN_AVATARS)
    .map((celebrant) => drawableText(celebrant.name))
    .concat(others > 0 ? [`+${others}`] : [])
    .join(" · ");
  const message = labels.message ? messageLines(ctx, labels.message) : [];

  // The text block is centred vertically, whatever the message's length.
  const height =
    34 +
    70 +
    52 +
    message.length * MESSAGE_LINE +
    (message.length ? 14 : 0) +
    24;
  let top = (HEIGHT - height) / 2;
  drawText(ctx, labels.kicker.toUpperCase(), TEXT_LEFT, top, 22, ACCENT);
  top += 34;
  drawFittedText(
    ctx,
    labels.title,
    TEXT_LEFT,
    top,
    56,
    PALETTE.text,
    width,
    32
  );
  top += 70;
  drawFittedText(ctx, names, TEXT_LEFT, top, 34, PALETTE.title, width, 20);
  top += 52;
  for (const line of message) {
    drawText(ctx, line, TEXT_LEFT, top, MESSAGE_SIZE, PALETTE.subtext);
    top += MESSAGE_LINE;
  }
  if (message.length > 0) {
    top += 14;
  }
  drawText(ctx, `🎂  ${labels.date}`, TEXT_LEFT, top, 20, PALETTE.placeholder);
  return ctx.canvas.toBuffer("image/png");
}
