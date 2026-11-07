import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import {
  animateCard,
  renderConfetti,
  type ConfettiScene,
} from "./confetti-3d.js";
import {
  createBoard,
  drawableText,
  drawPortraitStack,
  PALETTE,
  randomFrom,
  rgb,
  type Rgb,
} from "./imaging.js";
import { loggerMaker } from "./logger.js";
import { drawFittedText, drawText, fitText, measureText } from "./stat-card.js";

const logger = loggerMaker("celebration-card");

// The festive card of the modules that celebrate someone on their day
// (birthdays, member anniversaries, the server's anniversary): portraits on
// the left among confetti, the text on the right.

const WIDTH = 1000;
const HEIGHT = 380;
const PORTRAITS_CENTER = { x: 200, y: 190 };
const TEXT_LEFT = 400;
const TEXT_RIGHT = WIDTH - 50;
/** Where no confetti lands, flat or 3D: around the text, with a margin. */
const TEXT_ZONE = {
  left: TEXT_LEFT - 20,
  right: TEXT_RIGHT + 10,
  top: 60,
  bottom: HEIGHT - 50,
};
/** Portraits drawn before the "+N" bubble: callers fetch these avatars only. */
export const SHOWN_PORTRAITS = 3;
const QUOTE_SIZE = 24;
const LINE_HEIGHT = 32;
const QUOTE_LINES = 2;

const mix = (from: Rgb, to: Rgb, ratio: number): Rgb =>
  from.map((value, index) =>
    Math.round(value + (to[index]! - value) * ratio)
  ) as unknown as Rgb;

/** Confetti in shades of the module's accent. */
export function accentConfetti(accent: Rgb): Rgb[] {
  return [
    accent,
    mix(accent, PALETTE.text, 0.35),
    mix(accent, PALETTE.text, 0.7),
    mix(accent, PALETTE.background, 0.3),
  ];
}

/** Confetti in the module's accent among party colours. */
export function festiveConfetti(accent: Rgb): Rgb[] {
  return [
    accent,
    [141, 196, 255],
    [255, 200, 87],
    [94, 233, 181],
    [190, 160, 255],
  ];
}

export interface CelebrationCard {
  accent: Rgb;
  confetti: readonly Rgb[];
  /** Everyone celebrated: the first `SHOWN_PORTRAITS`, then "+N". */
  avatars: readonly (Image | null)[];
  /** Above the title, in capitals: the module. */
  kicker: string;
  title: string;
  /** Under the title: who is celebrated. */
  names: string;
  /** The server's own words, in quotes, on at most two lines. */
  quote?: { text: string; open: string; close: string };
  /** Facts, one line each. */
  details?: string[];
  /** The last line: the day. */
  footer: string;
}

/** Confetti drawn from a fixed seed: the same card always looks the same. */
function drawConfetti(ctx: SKRSContext2D, colors: readonly Rgb[]): void {
  const random = randomFrom(7);
  for (let i = 0; i < 70; i++) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    const color = colors[Math.floor(random() * colors.length)]!;
    const angle = random() * Math.PI;
    const size = 6 + random() * 8;
    const round = random() < 0.35;
    const alpha = 0.55 + random() * 0.35;
    // Clear of the text.
    if (
      x > TEXT_ZONE.left &&
      x < TEXT_ZONE.right &&
      y > TEXT_ZONE.top &&
      y < TEXT_ZONE.bottom
    ) {
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

/** The quote on at most `QUOTE_LINES` lines, the last one cut with "…". */
function quoteLines(
  ctx: SKRSContext2D,
  { text, open, close }: NonNullable<CelebrationCard["quote"]>
): string[] {
  // Room for the quotes on every line keeps the closing one after a "…".
  const width =
    TEXT_RIGHT - TEXT_LEFT - measureText(ctx, open + close, QUOTE_SIZE);
  const lines: string[] = [];
  let words = drawableText(text).trim().split(/\s+/);
  while (words.length > 0 && lines.length < QUOTE_LINES - 1) {
    let count = 1;
    while (
      count < words.length &&
      measureText(ctx, words.slice(0, count + 1).join(" "), QUOTE_SIZE) <= width
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
    (line) => fitText(ctx, line, QUOTE_SIZE, width, QUOTE_SIZE).text
  );
  fitted[0] = open + fitted[0];
  fitted[fitted.length - 1] += close;
  return fitted;
}

/** The still card, its confetti printed flat behind the portraits and the text. */
export function renderCelebrationCard(card: CelebrationCard): Buffer {
  return drawCard(card, true);
}

function drawCard(card: CelebrationCard, flatConfetti: boolean): Buffer {
  const { accent } = card;
  const ctx = createBoard(WIDTH, HEIGHT, 0, accent);

  const { x, y } = PORTRAITS_CENTER;
  const glow = ctx.createRadialGradient(x, y, 20, x, y, 260);
  glow.addColorStop(0, `rgba(${accent.join(", ")}, 0.28)`);
  glow.addColorStop(1, `rgba(${accent.join(", ")}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (flatConfetti) {
    drawConfetti(ctx, card.confetti);
  }

  const slots = Math.min(card.avatars.length, SHOWN_PORTRAITS + 1);
  const size = slots === 1 ? 190 : slots <= 3 ? 130 : 110;
  drawPortraitStack(ctx, card.avatars, {
    shown: SHOWN_PORTRAITS,
    centerX: x,
    centerY: y,
    size,
    step: size * 0.62,
    ring: accent,
    countSize: 40,
  });

  const width = TEXT_RIGHT - TEXT_LEFT;
  const lines = [
    ...(card.quote ? quoteLines(ctx, card.quote) : []),
    ...(card.details ?? []),
  ];
  // The text block is centred vertically, whatever its number of lines.
  const height =
    34 + 70 + 52 + lines.length * LINE_HEIGHT + (lines.length ? 14 : 0) + 24;
  let top = (HEIGHT - height) / 2;
  drawText(ctx, card.kicker.toUpperCase(), TEXT_LEFT, top, 22, accent);
  top += 34;
  drawFittedText(ctx, card.title, TEXT_LEFT, top, 56, PALETTE.text, width, 32);
  top += 70;
  drawFittedText(
    ctx,
    drawableText(card.names),
    TEXT_LEFT,
    top,
    34,
    PALETTE.title,
    width,
    20
  );
  top += 52;
  for (const line of lines) {
    drawFittedText(
      ctx,
      line,
      TEXT_LEFT,
      top,
      QUOTE_SIZE,
      PALETTE.subtext,
      width,
      16
    );
    top += LINE_HEIGHT;
  }
  if (lines.length > 0) {
    top += 14;
  }
  drawText(ctx, card.footer, TEXT_LEFT, top, 20, PALETTE.placeholder);
  return ctx.canvas.toBuffer("image/png");
}

/** The 3D confetti land around the portraits and the text, never on them. */
const PORTRAITS_RADIUS = 165;
const SCENE: ConfettiScene = {
  width: WIDTH,
  height: HEIGHT,
  launch: PORTRAITS_CENTER,
  clear: (x, y, radius) => {
    const onText =
      x + radius > TEXT_ZONE.left &&
      x - radius < TEXT_ZONE.right &&
      y + radius > TEXT_ZONE.top &&
      y - radius < TEXT_ZONE.bottom;
    const onPortraits =
      Math.hypot(x - PORTRAITS_CENTER.x, y - PORTRAITS_CENTER.y) <
      PORTRAITS_RADIUS + radius;
    return !onText && !onPortraits;
  },
};

/**
 * The confetti frames of each palette, drawn on first use: some 2 s of
 * drawing, shared by the cards of a daily run (one per server), for about
 * 10 MB each. Let go once no card has used them for a while, as the next run
 * is a day away.
 */
const confettiFrames = new Map<
  string,
  { frames: Promise<Buffer[]>; expiry: NodeJS.Timeout }
>();
const FRAMES_KEPT_MS = 10 * 60_000;

function framesFor(colors: readonly Rgb[]): Promise<Buffer[]> {
  const key = JSON.stringify(colors);
  const kept = confettiFrames.get(key);
  if (kept) {
    kept.expiry.refresh();
    return kept.frames;
  }
  const frames = renderConfetti(SCENE, colors);
  const expiry = setTimeout(
    () => confettiFrames.delete(key),
    FRAMES_KEPT_MS
  ).unref();
  confettiFrames.set(key, { frames, expiry });
  // A failure is not kept: the next card tries again.
  frames.catch(() => {
    clearTimeout(expiry);
    if (confettiFrames.get(key)?.frames === frames) {
      confettiFrames.delete(key);
    }
  });
  return frames;
}

/**
 * The card under 3D confetti thrown from the portraits, as an animated WebP
 * played once, which starts on its last frame for clients not animating it.
 */
async function renderAnimatedCelebrationCard(
  card: CelebrationCard
): Promise<Buffer> {
  const frames = await framesFor(card.confetti);
  return animateCard(drawCard(card, false), frames);
}

/** A card to attach: animated, or still when the animation fails. */
export interface CelebrationImage {
  data: Buffer;
  extension: "webp" | "png";
}

export async function renderCelebrationImage(
  card: CelebrationCard
): Promise<CelebrationImage> {
  try {
    return {
      data: await renderAnimatedCelebrationCard(card),
      extension: "webp",
    };
  } catch (err) {
    logger.warn({ err }, "Animated card failed, attaching the still one");
    return { data: renderCelebrationCard(card), extension: "png" };
  }
}
