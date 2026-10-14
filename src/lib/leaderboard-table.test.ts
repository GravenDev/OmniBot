import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { PALETTE, type Rgb } from "./imaging.js";
import { renderLeaderboardTable } from "./leaderboard-table.js";

const ACCENT: Rgb = [10, 200, 90];

async function pixels(png: Buffer) {
  const image = await loadImage(png);
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  return (x: number, y: number) => [
    ...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3),
  ];
}

const row = (rank: number) => ({ rank, name: `Player ${rank}`, avatar: null });

function render(caller?: ReturnType<typeof row>) {
  return renderLeaderboardTable({
    headers: { rank: "#", player: "Player" },
    columns: [],
    rows: [row(4), row(5)],
    caller,
    accent: ACCENT,
  });
}

describe("renderLeaderboardTable", () => {
  it("highlights the caller's row with the accent", async () => {
    const pixel = await pixels(await render(row(40)));

    expect(pixel(1, 100 + 2 * 90 + 20 + 45)).toEqual([...ACCENT]);
    expect(pixel(1, 100 + 45)).toEqual([...PALETTE.rowEven]);
  });

  it("separates the caller's row with a visible line", async () => {
    const pixel = await pixels(await render(row(40)));

    expect(pixel(400, 100 + 2 * 90 + 10)).toEqual([...PALETTE.separator]);
    expect(pixel(400, 100 + 2 * 90 + 4)).toEqual([...PALETTE.background]);
  });

  it("keeps each row within its own height", async () => {
    const pixel = await pixels(await render(row(40)));

    expect(pixel(400, 100 + 90 - 1)).toEqual([...PALETTE.rowEven]);
    expect(pixel(400, 100 + 90)).toEqual([...PALETTE.rowOdd]);
    expect(pixel(400, 100 + 2 * 90 - 1)).toEqual([...PALETTE.rowOdd]);
    expect(pixel(400, 100 + 2 * 90)).toEqual([...PALETTE.background]);
  });
});
