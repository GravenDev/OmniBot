import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedGame } from "../types.js";

const mocks = vi.hoisted(() => {
  const toBuffer = vi.fn(async () => Buffer.from("png"));
  const encode = vi.fn(async () => Buffer.from("png"));
  const canvas = {
    getContext: vi.fn(),
    toBuffer,
    encode,
  };
  const context = {
    canvas,
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  };
  canvas.getContext.mockReturnValue(context);
  return {
    context,
    toBuffer,
    encode,
    canvas,
    createCanvas: vi.fn(),
    loadImage: vi.fn(async () => ({ image: true })),
    sharp: vi.fn(),
  };
});

vi.mock("@napi-rs/canvas", () => ({
  createCanvas: mocks.createCanvas,
  loadImage: mocks.loadImage,
}));
vi.mock("sharp", () => ({
  default: mocks.sharp.mockImplementation(() => {
    const chain = {
      resize: vi.fn(),
      png: vi.fn(),
      toBuffer: mocks.toBuffer,
    };
    chain.resize.mockReturnValue(chain);
    chain.png.mockReturnValue(chain);
    return chain;
  }),
}));

import { parseGame } from "../games/pgn.js";
import { BADGE, COORD, renderBoard, SQUARE } from "./board.js";

const game = parseGame(`[Event "Test"]
[Result "1-0"]

1. e4 e5 *`) as ParsedGame;

describe("renderBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCanvas.mockReturnValue(mocks.canvas);
  });

  it("draws the frame and every piece of the initial position", async () => {
    const image = await renderBoard(game, 0, false);

    expect(image).toEqual(Buffer.from("png"));
    // Discord shows a board a few hundred pixels wide: 1024 keeps it sharp.
    expect(mocks.createCanvas).toHaveBeenCalledWith(1024, 1024);
    expect(mocks.context.drawImage).toHaveBeenCalledTimes(33); // frame + 32 pieces
    expect(mocks.context.fillRect).toHaveBeenCalledTimes(3); // background + two borders
    expect(mocks.context.save).not.toHaveBeenCalled();
    // Encoded on the canvas thread pool: a synchronous toBuffer would hold
    // the event loop for the whole encoding.
    expect(mocks.encode).toHaveBeenCalledWith("png");
    expect(mocks.toBuffer).not.toHaveBeenCalledWith(
      "image/png",
      expect.anything()
    );
  });

  it("rotates the frame, highlights the last move and adds a rating badge", async () => {
    await renderBoard(game, 1, true, "best");

    expect(mocks.context.save).toHaveBeenCalledOnce();
    expect(mocks.context.translate).toHaveBeenCalledWith(512, 512);
    expect(mocks.context.rotate).toHaveBeenCalledWith(Math.PI);
    expect(mocks.context.restore).toHaveBeenCalledOnce();
    // Two highlighted squares plus the last move's badge.
    expect(mocks.context.fillRect).toHaveBeenCalledTimes(5);
    expect(mocks.context.drawImage).toHaveBeenCalledTimes(34);
    expect(mocks.context.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ image: true }),
      expect.any(Number),
      expect.any(Number),
      BADGE,
      BADGE
    );
  });

  it("reuses the resampled assets of an earlier render", async () => {
    await renderBoard(game, 0, false);
    const sharpCalls = mocks.sharp.mock.calls.length;

    await renderBoard(game, 0, false);

    expect(mocks.sharp).toHaveBeenCalledTimes(sharpCalls);
    expect(mocks.context.drawImage).toHaveBeenCalledTimes(66);
    expect(COORD).toBeGreaterThan(0);
    expect(SQUARE).toBeGreaterThan(COORD);
  });
});
