import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  accentConfetti,
  festiveConfetti,
  renderCelebrationCard,
} from "./celebration-card.js";
import type { Rgb } from "./imaging.js";

const ACCENT: Rgb = [255, 158, 196];

describe("confetti", () => {
  it("starts with the module's accent", () => {
    expect(accentConfetti(ACCENT)[0]).toEqual(ACCENT);
    expect(festiveConfetti(ACCENT)[0]).toEqual(ACCENT);
  });

  it("keeps shades of the accent only", () => {
    // Every shade keeps pink's order: red above blue above green.
    for (const [red, green, blue] of accentConfetti(ACCENT)) {
      expect(red).toBeGreaterThanOrEqual(blue);
      expect(blue).toBeGreaterThanOrEqual(green);
    }
  });
});

describe("renderCelebrationCard", () => {
  it("draws a card of fixed size, whatever the text", async () => {
    const png = renderCelebrationCard({
      accent: ACCENT,
      confetti: accentConfetti(ACCENT),
      avatars: [null, null, null, null, null],
      kicker: "Anniversaires",
      title: "5 anniversaires !",
      names: "Camille · Yanis · Léa · +2",
      quote: { text: "Bonne journée ".repeat(30), open: "« ", close: " »" },
      details: ["Une ligne de plus"],
      footer: "🎂  1er novembre",
    });
    const image = await loadImage(png);
    expect([image.width, image.height]).toEqual([1000, 380]);
  });
});
