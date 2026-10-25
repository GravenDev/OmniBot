import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";

const { centeredTexts } = vi.hoisted(() => ({
  centeredTexts: [] as {
    text: string;
    left: number;
    right: number;
  }[],
}));
vi.mock("./imaging.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./imaging.js")>();
  return {
    ...original,
    fillTextCentered: (
      ctx: Parameters<typeof original.fillTextCentered>[0],
      text: string,
      x: number,
      centerY: number
    ) => {
      const width = ctx.measureText(text).width;
      const left = ctx.textAlign === "right" ? x - width : x;
      centeredTexts.push({ text, left, right: left + width });
      original.fillTextCentered(ctx, text, x, centerY);
    },
  };
});

import {
  fitText,
  measureText,
  renderStatCard,
  TREND_COLORS,
  type StatCard,
} from "./stat-card.js";

async function countColor(
  png: Buffer,
  [x, y, width, height]: [number, number, number, number],
  color: readonly number[]
): Promise<number> {
  const image = await loadImage(png);
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(x, y, width, height).data;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (
      data[index] === color[0] &&
      data[index + 1] === color[1] &&
      data[index + 2] === color[2]
    ) {
      count++;
    }
  }
  return count;
}

function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const box = { title: "Title", value: "42" };

function card(overrides: Partial<StatCard> = {}): StatCard {
  return {
    image: null,
    title: "Player",
    rows: [[box, box]],
    ...overrides,
  };
}

describe("renderStatCard", () => {
  it("grows with its rows", async () => {
    const oneRow = await renderStatCard(card());
    const threeRows = await renderStatCard(
      card({ rows: [[box], [box, box], [box, box, box]] })
    );

    expect(pngSize(oneRow)).toEqual({ width: 1000, height: 300 });
    expect(pngSize(threeRows)).toEqual({ width: 1000, height: 560 });
  });

  it("gives the aside panel the column right of the boxes", async () => {
    const draw = vi.fn();

    await renderStatCard(
      card({ rows: [[box], [box]], aside: { width: 300, draw } })
    );

    expect(draw).toHaveBeenCalledWith(expect.anything(), 660, 160, 300, 240);
  });

  it("lays a wider card out across its whole width", async () => {
    const draw = vi.fn();
    centeredTexts.length = 0;

    await renderStatCard(
      card({
        width: 1200,
        rank: { position: 7, total: 12 },
        rows: [[box], [box]],
        aside: { width: 300, draw },
      })
    );

    expect(draw).toHaveBeenCalledWith(expect.anything(), 860, 160, 300, 240);
    const total = centeredTexts.find((entry) => entry.text === " / 12")!;
    expect(total.right).toBeCloseTo(1200 - 40, 0);
  });

  it("renders a subtitle and a rank, with or without a medal", async () => {
    for (const position of [1, 7]) {
      const png = await renderStatCard(
        card({ subtitle: "Subtitle", rank: { position, total: 12 } })
      );
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    }
  });

  it.each([
    { rank: { position: 7, total: 1234 }, limit: "#7" },
    { rank: { position: 1, total: 12 }, limit: 1000 - 40 - 76 },
  ])(
    "keeps a long title and subtitle clear of the rank $rank.position",
    async ({ rank, limit }) => {
      const long = "W".repeat(64);
      centeredTexts.length = 0;

      await renderStatCard(card({ title: long, subtitle: long, rank }));

      const rankLeft =
        typeof limit === "number"
          ? limit
          : centeredTexts.find((entry) => entry.text === limit)!.left;
      const header = centeredTexts.filter((entry) =>
        entry.text.startsWith("W")
      );
      expect(header).toHaveLength(2);
      for (const entry of header) {
        expect(entry.text.endsWith("…")).toBe(true);
        expect(entry.right).toBeLessThan(rankLeft - 16);
      }
    }
  );

  it("draws the rank in the accent", async () => {
    const accent = [10, 200, 90] as const;
    const png = await renderStatCard(
      card({ rank: { position: 7, total: 12 }, accent })
    );

    expect(await countColor(png, [700, 0, 300, 120], accent)).toBeGreaterThan(
      100
    );
  });

  it("highlights a colored box unless told otherwise", async () => {
    const color = [10, 200, 90] as const;
    const edge: [number, number, number, number] = [42, 200, 3, 20];
    const highlighted = await renderStatCard(
      card({ rows: [[{ ...box, color }]] })
    );
    const plain = await renderStatCard(
      card({ rows: [[{ ...box, color, highlight: false }]] })
    );

    expect(await countColor(highlighted, edge, color)).toBe(60);
    expect(await countColor(plain, edge, color)).toBe(0);
  });

  it("adds the footer below the boxes, across the content width", async () => {
    const draw = vi.fn();

    const png = await renderStatCard(
      card({ rows: [[box], [box]], footer: { height: 200, draw } })
    );

    expect(draw).toHaveBeenCalledWith(expect.anything(), 40, 420, 920);
    expect(pngSize(png)).toEqual({ width: 1000, height: 420 + 200 + 30 });
  });

  it("puts the footer right below the header when there are no boxes", async () => {
    const draw = vi.fn();

    const png = await renderStatCard(
      card({ rows: [], footer: { height: 200, draw } })
    );

    expect(draw).toHaveBeenCalledWith(expect.anything(), 40, 160, 920);
    expect(pngSize(png)).toEqual({ width: 1000, height: 160 + 200 + 30 });
  });

  it("draws a trend before the subtext, in the color of its direction", async () => {
    const subtext: [number, number, number, number] = [60, 240, 60, 30];
    const plain = await renderStatCard(
      card({ rows: [[{ ...box, subtext: "yesterday: 3" }]] })
    );
    const up = await renderStatCard(
      card({
        rows: [
          [
            {
              ...box,
              subtext: "yesterday: 3",
              trend: { text: "+2", direction: "up" },
            },
          ],
        ],
      })
    );
    const down = await renderStatCard(
      card({
        rows: [[{ ...box, trend: { text: "-2", direction: "down" } }]],
      })
    );

    expect(await countColor(plain, subtext, TREND_COLORS.up)).toBe(0);
    expect(await countColor(up, subtext, TREND_COLORS.up)).toBeGreaterThan(20);
    expect(await countColor(down, subtext, TREND_COLORS.down)).toBeGreaterThan(
      20
    );
  });

  it("rejects a row that cannot be laid out", async () => {
    await expect(
      renderStatCard(card({ rows: [[box, box, box, box]] }))
    ).rejects.toThrow("1 to 3 boxes");
  });
});

describe("fitText", () => {
  const ctx = createCanvas(10, 10).getContext("2d");

  it("keeps a text that fits untouched", () => {
    expect(fitText(ctx, "Bob", 20, 500)).toEqual({ text: "Bob", size: 20 });
  });

  it("shrinks before truncating", () => {
    const fitted = fitText(
      ctx,
      "Medium text",
      30,
      measureText(ctx, "Medium text", 20)
    );

    expect(fitted.text).toBe("Medium text");
    expect(fitted.size).toBeLessThan(30);
  });

  it("ends with an ellipsis when even the smallest size overflows", () => {
    const value = "W".repeat(32);
    const fitted = fitText(ctx, value, 20, 100);

    expect(fitted.size).toBe(10);
    expect(fitted.text.endsWith("…")).toBe(true);
    expect(measureText(ctx, fitted.text, fitted.size)).toBeLessThanOrEqual(100);
  });
});
