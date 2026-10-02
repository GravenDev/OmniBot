import { fileURLToPath } from "node:url";
import {
  type Image,
  type SKRSContext2D,
  GlobalFonts,
  loadImage,
} from "@napi-rs/canvas";
import type { User } from "discord.js";
import { loggerMaker } from "./logger.js";

const logger = loggerMaker("imaging");

const AVATAR_TIMEOUT_MS = 5_000;

export type Rgb = readonly [number, number, number];

export function rgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
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

export async function fetchAvatar(
  user: User,
  size: 64 | 128 | 256 = 128
): Promise<Image | null> {
  try {
    const response = await fetch(
      user.displayAvatarURL({ extension: "png", size }),
      { signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS) }
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    logger.warn({ err }, `Could not fetch avatar | userId = ${user.id}`);
    return null;
  }
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
    ctx.fillStyle = rgb([120, 120, 120]);
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

export type TextAnchor = "top" | "ascender";

export function fillTextAnchored(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  anchor: TextAnchor = "top"
): void {
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(text);
  const ascent =
    anchor === "top"
      ? metrics.actualBoundingBoxAscent
      : metrics.fontBoundingBoxAscent;
  ctx.fillText(text, x, y + ascent);
}

export interface FittedTextOptions {
  family: string;
  size: number;
  maxWidth: number;
  color: string;
  align?: "left" | "right";
}

export function drawFittedText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  { family, size, maxWidth, color, align = "left" }: FittedTextOptions
): void {
  let fontSize = size;
  ctx.font = `${fontSize}px ${family}`;
  while (fontSize > 1 && ctx.measureText(text).width > maxWidth) {
    fontSize -= 1;
    ctx.font = `${fontSize}px ${family}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  fillTextAnchored(ctx, text, x, y);
}
