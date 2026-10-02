import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { loadAsset, registerFont, rgb, type Rgb } from "#lib/imaging.js";

const ASSETS = new URL("../assets/", import.meta.url);

export const FONT = "RngdleOutfit";
export const MONO_FONT = "RngdleSpaceMonoBold";

export const PALETTE = {
  background: [25, 25, 25],
  header: [50, 50, 50],
  rowEven: [35, 35, 35],
  rowOdd: [45, 45, 45],
  box: [35, 35, 35],
  text: [255, 255, 255],
  title: [200, 200, 200],
  subtext: [170, 170, 170],
} as const satisfies Record<string, Rgb>;

export function registerFonts(): void {
  registerFont(new URL("outfit.ttf", ASSETS), FONT);
  registerFont(new URL("spacemono_bold.ttf", ASSETS), MONO_FONT);
}

export function font(size: number, family: string = FONT): string {
  return `${size}px ${family}`;
}

export function loadMedals(): Promise<[Image, Image, Image]> {
  return Promise.all([
    loadAsset(new URL("medal_gold.png", ASSETS)),
    loadAsset(new URL("medal_silver.png", ASSETS)),
    loadAsset(new URL("medal_bronze.png", ASSETS)),
  ]);
}

export function loadIcon(name: "arrow_up" | "trash"): Promise<Image> {
  return loadAsset(new URL(`${name}.png`, ASSETS));
}

export function fillRoundedBox(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  outline?: Rgb
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fillStyle = rgb(PALETTE.box);
  ctx.fill();
  if (outline) {
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, width - 2, height - 2, 11);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgb(outline);
    ctx.stroke();
  }
}
