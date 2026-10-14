import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { ACCENT } from "./theme.js";
import {
  renderVersus,
  type VersusImageData,
  type VersusLabels,
  type VersusPlayer,
} from "./versus.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const labels: VersusLabels = {
  vs: "VS",
  totalScore: "Overall Score",
  totalRolls: "Total Rolls",
  averageScore: "Average Score",
  bestRoll: "Best Roll",
  maxBadges: "Max Badges",
  headToHead: "Head-to-head",
  wins: (count) => (count === 1 ? "win" : "wins"),
  duelDetail: (days, ties) => `${days} days in common · ${ties} ties`,
  noCommonDay: "No day in common",
};

const active: VersusPlayer = {
  name: "A very long nickname that cannot possibly fit in the header",
  avatar: null,
  totalScore: 123_456_789,
  totalRolls: 321,
  average: { score: 4567, tier: "RARE" },
  best: { number: 131_081_274, score: 4_200_000, tier: "MYTHIC" },
  maxBadges: 4,
};

const newcomer: VersusPlayer = {
  name: "Bob",
  avatar: null,
  totalScore: 0,
  totalRolls: 0,
  average: null,
  best: null,
  maxBadges: null,
};

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const image = await loadImage(png);
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  return [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)];
}

function size(png: Buffer) {
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("renderVersus", () => {
  it("renders the same frame with or without a common day", async () => {
    const duel: VersusImageData = {
      left: active,
      right: { ...active, name: "Alice", totalScore: 5 },
      headToHead: { days: 30, left: 12, right: 15, ties: 3 },
      winners: {
        totalScore: "left",
        totalRolls: "tie",
        averageScore: "tie",
        bestRoll: "tie",
        maxBadges: "tie",
        headToHead: "right",
      },
    };
    const lonely: VersusImageData = {
      left: active,
      right: newcomer,
      headToHead: { days: 0, left: 0, right: 0, ties: 0 },
      winners: {
        totalScore: "left",
        totalRolls: "left",
        averageScore: "left",
        bestRoll: "left",
        maxBadges: "left",
        headToHead: null,
      },
    };

    const [first, second] = await Promise.all([
      renderVersus(duel, labels),
      renderVersus(lonely, labels),
    ]);

    expect(size(first)).toEqual({ width: 1000, height: 890 });
    expect(size(second)).toEqual(size(first));
    expect(first.equals(second)).toBe(false);
  });

  it.each([
    { winner: "left", edgeX: 42, otherX: 957 },
    { winner: "right", edgeX: 957, otherX: 42 },
  ] as const)(
    "marks the $winner side as the winner of a line",
    async ({ winner, edgeX, otherX }) => {
      const png = await renderVersus(
        {
          left: active,
          right: { ...active, name: "Alice" },
          headToHead: { days: 0, left: 0, right: 0, ties: 0 },
          winners: {
            totalScore: winner,
            totalRolls: "tie",
            averageScore: "tie",
            bestRoll: "tie",
            maxBadges: "tie",
            headToHead: null,
          },
        },
        labels
      );

      const rowCenter = 160 + 46;
      expect(await pixel(png, edgeX, rowCenter)).toEqual([...ACCENT]);
      expect(await pixel(png, otherX, rowCenter)).not.toEqual([...ACCENT]);
    }
  );
});
