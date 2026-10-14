import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { BODY_TOP, DEFAULT_WIDTH, MARGIN } from "#lib/stat-card.js";
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

async function accentAt(png: Buffer, from: number, to: number, y: number) {
  const image = await loadImage(png);
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(from, y, to - from, 1).data;
  for (let index = 0; index < data.length; index += 4) {
    if (
      data[index] === ACCENT[0] &&
      data[index + 1] === ACCENT[1] &&
      data[index + 2] === ACCENT[2]
    ) {
      return true;
    }
  }
  return false;
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

  const leftEdge = [MARGIN, MARGIN + 12] as const;
  const rightEdge = [
    DEFAULT_WIDTH - MARGIN - 12,
    DEFAULT_WIDTH - MARGIN,
  ] as const;

  it.each([
    { winner: "left", edge: leftEdge, other: rightEdge },
    { winner: "right", edge: rightEdge, other: leftEdge },
  ] as const)(
    "marks the $winner side as the winner of a line",
    async ({ winner, edge, other }) => {
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

      const y = BODY_TOP + 30;
      expect(await accentAt(png, ...edge, y)).toBe(true);
      expect(await accentAt(png, ...other, y)).toBe(false);
    }
  );
});
