import { fileURLToPath } from "node:url";
import {
  type Image,
  type SKRSContext2D,
  createCanvas,
  GlobalFonts,
  loadImage,
} from "@napi-rs/canvas";
import type { User } from "discord.js";
import { loggerMaker } from "./logger.js";

const logger = loggerMaker("imaging");

const AVATAR_TIMEOUT_MS = 5_000;
const ASSETS = new URL("./assets/", import.meta.url);

export const FONT = "Outfit";

export type Rgb = readonly [number, number, number];

export const PALETTE = {
  background: [25, 25, 25],
  header: [50, 50, 50],
  rowEven: [35, 35, 35],
  rowOdd: [45, 45, 45],
  box: [35, 35, 35],
  text: [255, 255, 255],
  title: [200, 200, 200],
  subtext: [170, 170, 170],
  placeholder: [120, 120, 120],
} as const satisfies Record<string, Rgb>;

export function rgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function font(size: number, family: string = FONT): string {
  return `${size}px ${family}`;
}

const registeredFonts = new Set<string>();

export function registerFont(file: URL, family: string): void {
  if (registeredFonts.has(family)) {
    return;
  }
  GlobalFonts.registerFromPath(fileURLToPath(file), family);
  registeredFonts.add(family);
}

const imageCache = new Map<string, Promise<Image>>();

export function loadAsset(file: URL): Promise<Image> {
  const key = file.href;
  let image = imageCache.get(key);
  if (!image) {
    image = loadImage(fileURLToPath(file));
    imageCache.set(key, image);
    image.catch(() => imageCache.delete(key));
  }
  return image;
}

export function loadMedals(): Promise<Image[]> {
  return Promise.all(
    ["gold", "silver", "bronze"].map((medal) =>
      loadAsset(new URL(`medal_${medal}.png`, ASSETS))
    )
  );
}

export async function fetchImage(url: string | null): Promise<Image | null> {
  if (!url) {
    return null;
  }
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    logger.warn({ err }, `Could not fetch image | url = ${url}`);
    return null;
  }
}

export function fetchAvatar(
  user: User,
  size: 64 | 128 | 256 = 128
): Promise<Image | null> {
  return fetchImage(user.displayAvatarURL({ extension: "png", size }));
}

export function fillBand(
  ctx: SKRSContext2D,
  color: Rgb,
  top: number,
  bottom: number
): void {
  ctx.fillStyle = rgb(color);
  ctx.fillRect(0, top, ctx.canvas.width, bottom - top + 1);
}

export function createBoard(
  width: number,
  height: number,
  headerHeight: number
): SKRSContext2D {
  registerFont(new URL("outfit.ttf", ASSETS), FONT);
  const ctx = createCanvas(width, height).getContext("2d");
  fillBand(ctx, PALETTE.background, 0, height - 1);
  fillBand(ctx, PALETTE.header, 0, headerHeight);
  return ctx;
}

export function drawCircularImage(
  ctx: SKRSContext2D,
  image: Image | null,
  x: number,
  y: number,
  size: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    ctx.fillStyle = rgb(PALETTE.placeholder);
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

export function fillTextCentered(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  centerY: number
): void {
  ctx.textBaseline = "alphabetic";
  const capHeight = ctx.measureText("H").actualBoundingBoxAscent;
  ctx.fillText(text, x, Math.round(centerY + capHeight / 2));
}

export function fillTextAnchored(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  anchor: "top" | "ascender" = "top"
): void {
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(text);
  const ascent =
    anchor === "top"
      ? metrics.actualBoundingBoxAscent
      : metrics.fontBoundingBoxAscent;
  ctx.fillText(text, x, y + ascent);
}
