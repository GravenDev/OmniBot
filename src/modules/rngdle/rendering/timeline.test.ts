import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { TIER_COLORS } from "#modules/rngdle/services/scoring.js";
import {
  renderTimeline,
  stackPins,
  type TimelinePin,
  type TimelineTier,
} from "./timeline.js";

const labels = {
  subtitle: "Frise · depuis juin 2026 · 130 tirages",
  counts: { MYTHIC: "Mythiques", ANOMALY: "Anomalies", TRASH: "Trash" },
  legend: { MYTHIC: "Mythique", ANOMALY: "Anomalie", TRASH: "Trash" },
  expected: (value: number) => `attendu : ${value}`,
  timeline: "Frise chronologique",
};

const pin = (day: number, tier: TimelineTier): TimelinePin => ({
  at: new Date(Date.UTC(2026, 0, day)),
  tier,
  score: 340_195,
  dateText: `${day} janv.`,
});

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const image = await loadImage(png);
  const ctx = createCanvas(image.width, image.height).getContext("2d");
  ctx.drawImage(image, 0, 0);
  return [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)];
}

describe("stackPins", () => {
  const xOf = (date: Date) => date.getUTCDate() * 10;

  it("raises a pin that would overlap a neighbour, mythics first", () => {
    const stacked = stackPins(
      [pin(10, "ANOMALY"), pin(11, "MYTHIC"), pin(20, "ANOMALY")],
      xOf
    );

    expect(stacked.map(({ pin, lane }) => [pin.tier, lane])).toEqual([
      ["MYTHIC", 0],
      ["ANOMALY", 1],
      ["ANOMALY", 0],
    ]);
  });

  it("stacks trash below the line separately, up to three lanes", () => {
    const stacked = stackPins(
      [
        pin(10, "ANOMALY"),
        ...Array.from({ length: 4 }, () => pin(10, "TRASH")),
      ],
      xOf
    );

    expect(stacked.map(({ lane }) => lane)).toEqual([0, 0, 1, 2, 2]);
  });
});

describe("renderTimeline", () => {
  it("draws the three counts then the timeline, 1000px wide", async () => {
    const png = await renderTimeline(
      {
        username: "yerminator",
        avatar: null,
        from: new Date(Date.UTC(2026, 0, 1)),
        to: new Date(Date.UTC(2026, 2, 1)),
        firstRoll: new Date(Date.UTC(2026, 0, 5)),
        now: new Date(Date.UTC(2026, 1, 20)),
        months: [
          { start: new Date(Date.UTC(2026, 0, 1)), label: "janv. 2026" },
          { start: new Date(Date.UTC(2026, 1, 1)), label: "févr." },
        ],
        pins: [
          {
            ...pin(1, "MYTHIC"),
            at: new Date(Date.UTC(2026, 0, 30, 12)),
          },
        ],
        totalRolls: 40,
      },
      labels
    );

    expect(png.readUInt32BE(16)).toBe(1000);
    expect(png.readUInt32BE(20)).toBe(160 + 110 + 20 + 400 + 30);
    expect(await pixel(png, 500, 520)).toEqual([...TIER_COLORS.MYTHIC]);
  });
});
