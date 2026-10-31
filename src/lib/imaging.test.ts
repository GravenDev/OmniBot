import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBoard,
  drawableText,
  drawHighlight,
  drawPortrait,
  loadAsset,
  PALETTE,
  type Rgb,
} from "./imaging.js";

const ACCENT: Rgb = [10, 200, 90];

function pixel(ctx: SKRSContext2D, x: number, y: number): number[] {
  return [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)];
}

let directory: string | undefined;

afterEach(() => {
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

describe("loadAsset", () => {
  it("retries an asset whose previous load failed", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "omnibot-imaging-"));
    const file = path.join(directory, "pixel.png");
    const url = pathToFileURL(file);

    await expect(loadAsset(url)).rejects.toThrow();

    writeFileSync(file, await createCanvas(1, 1).encode("png"));

    const image = await loadAsset(url);
    expect(image.width).toBe(1);
  });
});

describe("createBoard", () => {
  it("underlines the header with the accent", () => {
    const ctx = createBoard(20, 40, 20, ACCENT);

    expect(pixel(ctx, 10, 16)).toEqual([...PALETTE.header]);
    expect(pixel(ctx, 10, 17)).toEqual([...ACCENT]);
    expect(pixel(ctx, 10, 19)).toEqual([...ACCENT]);
    expect(pixel(ctx, 10, 20)).toEqual([...PALETTE.background]);
  });
});

describe("drawPortrait", () => {
  it("rings the portrait with the given color", () => {
    const ctx = createCanvas(40, 40).getContext("2d");

    drawPortrait(ctx, null, 10, 10, 20, ACCENT);

    expect(pixel(ctx, 20, 8)).toEqual([...ACCENT]);
    expect(pixel(ctx, 20, 20)).toEqual([...PALETTE.placeholder]);
  });
});

describe("drawHighlight", () => {
  it.each(["left", "right"] as const)(
    "tints the area and draws a solid %s edge",
    (edge) => {
      const ctx = createCanvas(40, 20).getContext("2d");
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, 40, 20);

      drawHighlight(ctx, 0, 0, 40, 20, ACCENT, { edge });

      const [edgeX, otherX] = edge === "left" ? [1, 38] : [38, 1];
      expect(pixel(ctx, edgeX, 10)).toEqual([...ACCENT]);
      const tint = pixel(ctx, otherX, 10);
      expect(tint[1]).toBeGreaterThan(0);
      expect(tint[1]).toBeLessThan(ACCENT[1] / 4);
    }
  );
});

describe("drawableText", () => {
  it("swaps the look-alikes of | the fonts lack for a bar they have", () => {
    expect(drawableText("🎪｜le-jeu-des-4h")).toBe("🎪 | le-jeu-des-4h");
    expect(drawableText("a ｜ b")).toBe("a | b");
    expect(drawableText("❔︱c︱cpp︱rust")).toBe("❔ | c | cpp | rust");
    for (const bar of ["ǀ", "∣", "⏐", "│", "┃"]) {
      expect(drawableText(`💥${bar}général`)).toBe("💥|général");
    }
  });

  it("leaves the other characters alone", () => {
    expect(drawableText("général | 4h ¦ ✨")).toBe("général | 4h ¦ ✨");
  });
});
