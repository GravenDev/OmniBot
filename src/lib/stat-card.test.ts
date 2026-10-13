import { createCanvas } from "@napi-rs/canvas";
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
  type StatCard,
} from "./stat-card.js";

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
