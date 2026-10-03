import { describe, expect, it, vi } from "vitest";
import { renderStatCard, type StatCard } from "./stat-card.js";

function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const box = { title: "Title", value: "42" };

function card(overrides: Partial<StatCard> = {}): StatCard {
  return {
    image: null,
    title: { text: "Player", y: 35, size: 50 },
    valueSize: 30,
    rows: [[box, box]],
    ...overrides,
  };
}

describe("renderStatCard", () => {
  it("grows with its rows and its footer", async () => {
    const twoRows = await renderStatCard(
      card({ rows: [[box], [box, box, box]] })
    );
    const withFooter = await renderStatCard(
      card({ footer: { height: 240, draw: vi.fn() } })
    );

    expect(pngSize(twoRows)).toEqual({ width: 800, height: 450 });
    expect(pngSize(withFooter)).toEqual({ width: 800, height: 580 });
  });

  it("hands the footer its top position", async () => {
    const draw = vi.fn();

    await renderStatCard(
      card({ rows: [[box], [box]], footer: { height: 10, draw } })
    );

    expect(draw).toHaveBeenCalledWith(expect.anything(), 440);
  });

  it("renders a rank, with or without a medal", async () => {
    for (const position of [1, 7]) {
      const png = await renderStatCard(card({ rank: { position, total: 12 } }));
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    }
  });

  it("rejects a row that cannot be laid out", async () => {
    await expect(
      renderStatCard(card({ rows: [[box, box, box, box]] }))
    ).rejects.toThrow("1 to 3 boxes");
  });
});
