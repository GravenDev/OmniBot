import { describe, expect, it, vi } from "vitest";
import { renderStatCard, type StatCard } from "./stat-card.js";

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

  it("rejects a row that cannot be laid out", async () => {
    await expect(
      renderStatCard(card({ rows: [[box, box, box, box]] }))
    ).rejects.toThrow("1 to 3 boxes");
  });
});
