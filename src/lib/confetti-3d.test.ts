import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  animateCard,
  clipAround,
  CONFETTI_DURATION,
  CONFETTI_FADE_FRAMES,
  CONFETTI_REST_MS,
  hsl,
  renderConfetti,
  type ConfettiScene,
} from "./confetti-3d.js";
import type { Rgb } from "./imaging.js";

const COLORS: Rgb[] = [
  [255, 158, 196],
  [141, 196, 255],
];
// A card with a text box on its right: nothing lands on it.
const TEXT = { left: 200, right: 380, top: 30, bottom: 120 };
const SCENE: ConfettiScene = {
  width: 400,
  height: 150,
  launch: { x: 80, y: 75 },
  clear: (x, y, radius) =>
    x + radius < TEXT.left ||
    x - radius > TEXT.right ||
    y + radius < TEXT.top ||
    y - radius > TEXT.bottom,
};
// Few frames: the timing is the same, spread over fewer images.
const FRAMES = 7;

async function alpha(png: Buffer): Promise<Buffer> {
  return sharp(png).extractChannel("alpha").raw().toBuffer();
}

/** Mean difference between two images' channels: about 1 for the lossy encoding alone, 10 and more for a wrong frame. */
function gap(a: Buffer, b: Buffer): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    total += Math.abs(a[i]! - b[i]!);
  }
  return total / a.length;
}

describe("renderConfetti", () => {
  it("throws nothing before the start, lands everything at the end", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    expect(frames).toHaveLength(FRAMES);
    expect((await alpha(frames[0]!)).every((value) => value === 0)).toBe(true);
    const last = await alpha(frames.at(-1)!);
    expect(last.some((value) => value > 0)).toBe(true);
  });

  it("keeps the landed confetti off the text", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    const last = await alpha(frames.at(-1)!);
    for (let y = TEXT.top; y < TEXT.bottom; y++) {
      for (let x = TEXT.left; x < TEXT.right; x++) {
        expect(last[y * SCENE.width + x], `at ${x}, ${y}`).toBe(0);
      }
    }
  });

  it("draws the same confetti for the same palette", async () => {
    const [a, b] = await Promise.all([
      renderConfetti(SCENE, COLORS, FRAMES),
      renderConfetti(SCENE, COLORS, FRAMES),
    ]);
    expect(a.every((frame, i) => frame.equals(b[i]!))).toBe(true);
  });

  it("lets the bot's other tasks run between two frames", async () => {
    let turns = 0;
    const ticking = setInterval(() => turns++, 0);
    await renderConfetti(SCENE, COLORS, FRAMES);
    clearInterval(ticking);
    expect(turns).toBeGreaterThan(1);
  });

  it("throws nothing where no piece fits", async () => {
    const frames = await renderConfetti(
      { ...SCENE, clear: () => false },
      COLORS,
      FRAMES
    );
    expect((await alpha(frames.at(-1)!)).every((value) => value === 0)).toBe(
      true
    );
  });

  it("needs a frame for the throw and one for the landing", async () => {
    await expect(renderConfetti(SCENE, COLORS, 1)).rejects.toThrow(RangeError);
  });
});

describe("hsl", () => {
  it("turns a negative hue the same way round", () => {
    // Foil facing away from the light gets a negative hue: purple, not magenta.
    expect(hsl(-90, 0.75, 0.62)).toEqual(hsl(270, 0.75, 0.62));
    expect(hsl(-200, 0.5, 0.5)).toEqual(hsl(160, 0.5, 0.5));
  });
});

describe("animateCard", () => {
  const card = () => {
    const ctx = createCanvas(SCENE.width, SCENE.height).getContext("2d");
    // Top to bottom: a card out of place would show.
    const shade = ctx.createLinearGradient(0, 0, 0, SCENE.height);
    shade.addColorStop(0, "#123456");
    shade.addColorStop(1, "#e0c070");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, SCENE.width, SCENE.height);
    return ctx.canvas.toBuffer("image/png");
  };

  it("plays once on request, starting on the landed confetti", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    const webp = await animateCard(card(), frames, { loop: false });
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.loop).toBe(1);
    expect(meta.pageHeight ?? meta.height).toBe(SCENE.height);
    // The still frame, then the throw: one frame longer than the throw.
    const step = Math.round((CONFETTI_DURATION * 1000) / (FRAMES - 1));
    expect(meta.delay!.reduce((sum, ms) => sum + ms, 0)).toBe(
      step * FRAMES + step
    );
    const first = await sharp(webp, { page: 0 }).raw().toBuffer();
    const last = await sharp(webp, { page: meta.pages! - 1 })
      .raw()
      .toBuffer();
    // Lossy: equal give or take the encoding.
    expect(gap(first, last)).toBeLessThan(3);
  });

  it("replays forever by default, resting on the landed confetti", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    const webp = await animateCard(card(), frames);
    const meta = await sharp(webp).metadata();
    expect(meta.loop).toBe(0);
    // Still the landed confetti first, for clients that do not animate.
    const first = await sharp(webp, { page: 0 }).raw().toBuffer();
    const last = await sharp(webp, { page: meta.pages! - 1 })
      .raw()
      .toBuffer();
    expect(gap(first, last)).toBeLessThan(3);
    const step = Math.round((CONFETTI_DURATION * 1000) / (FRAMES - 1));
    // The landed confetti stay a while before the next throw. libwebp merges
    // equal frames in a row, adding up their delays: the total tells.
    expect(meta.delay!.at(-1)).toBeGreaterThanOrEqual(CONFETTI_REST_MS);
    expect(meta.delay!.reduce((sum, ms) => sum + ms, 0)).toBe(
      step * (FRAMES + CONFETTI_FADE_FRAMES) + CONFETTI_REST_MS
    );
  });

  it("fades the landed confetti out before throwing again", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    const webp = await animateCard(card(), frames);
    const alone = await sharp(card()).removeAlpha().raw().toBuffer();
    const fromCard = async (page: number) =>
      gap(await sharp(webp, { page }).removeAlpha().raw().toBuffer(), alone);
    // From the landed confetti down to the bare card, a little each frame.
    const fading = [];
    for (let page = 0; page <= CONFETTI_FADE_FRAMES + 1; page++) {
      fading.push(await fromCard(page));
    }
    for (let i = 1; i < fading.length; i++) {
      expect(fading[i], `frame ${i}`).toBeLessThan(fading[i - 1]!);
    }
    expect(fading.at(-1)).toBeLessThan(3);
  });

  it("plays once without fading", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    const webp = await animateCard(card(), frames, { loop: false });
    expect((await sharp(webp).metadata()).pages).toBeLessThanOrEqual(
      FRAMES + 1
    );
  });

  it("puts the card under the frames", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    const webp = await animateCard(card(), frames, { loop: false });
    // The throw's first frame holds no confetti yet: the card alone, give or
    // take the lossy encoding.
    const thrown = await sharp(webp, { page: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    const alone = await sharp(card()).removeAlpha().raw().toBuffer();
    expect(gap(thrown, alone)).toBeLessThan(3);
  });

  it("shows the landed confetti over the card", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    const webp = await animateCard(card(), frames);
    const meta = await sharp(webp).metadata();
    const landed = await sharp(webp, { page: meta.pages! - 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    const alone = await sharp(card()).removeAlpha().raw().toBuffer();
    // Where a piece lies, the card does not show through.
    const pieces = await alpha(frames.at(-1)!);
    let covered = 0;
    let differing = 0;
    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i]! === 255) {
        covered++;
        const at = i * 3;
        differing +=
          gap(landed.subarray(at, at + 3), alone.subarray(at, at + 3)) > 20
            ? 1
            : 0;
      }
    }
    expect(covered).toBeGreaterThan(100);
    expect(differing / covered).toBeGreaterThan(0.8);
  });

  it("keeps no libvips cache between two cards", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    await animateCard(card(), frames);
    // Once a day: a cache would hold memory for nothing.
    expect(sharp.cache().memory.max).toBe(0);
  });

  it("refuses a card of another size than the frames", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    const taller = createCanvas(SCENE.width, SCENE.height + 20)
      .getContext("2d")
      .canvas.toBuffer("image/png");
    await expect(animateCard(taller, frames)).rejects.toThrow(RangeError);
  });

  it("needs a frame for the throw and one for the landing", async () => {
    const frames = await renderConfetti(SCENE, COLORS, FRAMES);
    await expect(animateCard(card(), frames.slice(0, 1))).rejects.toThrow(
      RangeError
    );
  });
});

describe("clipAround", () => {
  it("clips to the box, grown by three radii", () => {
    const ctx = createCanvas(100, 100).getContext("2d");
    clipAround(
      ctx,
      [
        [40, 40],
        [50, 45],
      ],
      2
    );
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 100, 100);
    const pixel = (x: number, y: number) =>
      ctx.getImageData(x, y, 1, 1).data[3];
    // 3 × 2 + 2 = 8 around the box: from 32 to 57, then from 32 to 52.
    expect(pixel(32, 32)).toBe(255);
    expect(pixel(57, 52)).toBe(255);
    expect(pixel(58, 52)).toBe(0);
    expect(pixel(31, 40)).toBe(0);
    expect(pixel(40, 54)).toBe(0);
  });
});
