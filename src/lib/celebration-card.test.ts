import { loadImage } from "@napi-rs/canvas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfettiScene } from "./confetti-3d.js";
import type { Rgb } from "./imaging.js";

// The 3D engine has its own tests: here, only how the card uses it.
const engine = vi.hoisted(() => ({
  renderConfetti: vi.fn(async (..._args: unknown[]) => [Buffer.from("frame")]),
  animateCard: vi.fn(async (..._args: unknown[]) => Buffer.from("webp")),
}));
vi.mock("./confetti-3d.js", () => engine);
const warn = vi.hoisted(() => vi.fn());
vi.mock("./logger.js", () => ({ loggerMaker: () => ({ warn }) }));

const {
  accentConfetti,
  festiveConfetti,
  renderCelebrationCard,
  renderCelebrationImage,
} = await import("./celebration-card.js");

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

describe("renderCelebrationImage", () => {
  // A palette per test: the confetti frames are kept per palette.
  let palette = 0;
  const card = () => ({
    accent: ACCENT,
    confetti: [[palette, 0, 0]] as Rgb[],
    avatars: [null],
    kicker: "Anniversaire",
    title: "Joyeux anniversaire !",
    names: "Camille",
    footer: "🎂  1er novembre",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    palette++;
  });

  it("animates the card under the 3D confetti", async () => {
    const image = await renderCelebrationImage(card());
    expect(image).toEqual({ data: Buffer.from("webp"), extension: "webp" });
    const [bare, frames] = engine.animateCard.mock.calls[0]!;
    expect(frames).toEqual([Buffer.from("frame")]);
    // Without the flat confetti of the still card: the 3D ones replace them.
    expect(bare).toEqual(expect.any(Buffer));
    expect((bare as Buffer).equals(renderCelebrationCard(card()))).toBe(false);
  });

  it("passes the loop choice on to the animation", async () => {
    await renderCelebrationImage(card());
    await renderCelebrationImage(card(), { loop: false });
    expect(engine.animateCard.mock.calls.map((call) => call[2])).toEqual([
      {},
      { loop: false },
    ]);
  });

  it("draws a palette's confetti once for all its cards", async () => {
    await Promise.all([
      renderCelebrationImage(card()),
      renderCelebrationImage(card()),
    ]);
    await renderCelebrationImage(card());
    expect(engine.renderConfetti).toHaveBeenCalledTimes(1);
    expect(engine.animateCard).toHaveBeenCalledTimes(3);
  });

  it("lets the frames go a while after the last card", async () => {
    vi.useFakeTimers();
    try {
      await renderCelebrationImage(card());
      // Within the window, each card keeps the frames a while longer.
      await vi.advanceTimersByTimeAsync(9 * 60_000);
      await renderCelebrationImage(card());
      await vi.advanceTimersByTimeAsync(9 * 60_000);
      await renderCelebrationImage(card());
      expect(engine.renderConfetti).toHaveBeenCalledTimes(1);
      // Then no card for long enough: drawn again.
      await vi.advanceTimersByTimeAsync(11 * 60_000);
      await renderCelebrationImage(card());
      expect(engine.renderConfetti).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lands the confetti clear of the portraits and the text", async () => {
    await renderCelebrationImage(card());
    const scene = engine.renderConfetti.mock.calls[0]![0] as ConfettiScene;
    expect(scene).toMatchObject({ width: 1000, height: 380 });
    // The portraits, the text, its margin by a piece's radius, then between.
    expect(scene.clear(200, 190, 5)).toBe(false);
    expect(scene.clear(600, 190, 5)).toBe(false);
    expect(scene.clear(378, 190, 5)).toBe(false);
    expect(scene.clear(372, 190, 5)).toBe(true);
    expect(scene.clear(600, 20, 5)).toBe(true);
    expect(scene.clear(20, 20, 5)).toBe(true);
    expect(scene.clear(600, 350, 5)).toBe(true);
  });

  it("attaches the still card when the animation fails", async () => {
    engine.animateCard.mockRejectedValueOnce(new Error("libvips"));
    const image = await renderCelebrationImage(card());
    expect(image.extension).toBe("png");
    expect(image.data.equals(renderCelebrationCard(card()))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("draws the confetti again after a failure", async () => {
    engine.renderConfetti.mockRejectedValueOnce(new Error("canvas"));
    expect((await renderCelebrationImage(card())).extension).toBe("png");
    expect((await renderCelebrationImage(card())).extension).toBe("webp");
    expect(engine.renderConfetti).toHaveBeenCalledTimes(2);
  });
});
