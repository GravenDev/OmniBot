import { describe, expect, it, vi } from "vitest";

// libvips missing from the image (another platform's optional dependency):
// the engine still loads, only the animation fails, and the cards fall back
// to the still one.
vi.mock("sharp", () => {
  throw new Error("Could not load the sharp module");
});

// Loading the engine is the point: it must not throw.
const { animateCard } = await import("./confetti-3d.js");

describe("without sharp", () => {
  it("loads, and only the animation fails", async () => {
    await expect(
      animateCard(Buffer.from("card"), [Buffer.from("a"), Buffer.from("b")])
    ).rejects.toMatchObject({
      // Vitest wraps the module's own error.
      cause: { message: "Could not load the sharp module" },
    });
  });
});
